import {
  createExecutionNetworkTrace,
  createExecutionTestReport,
  createExecutionRequest,
  toExecutionNetworkTraceValue,
  toExecutionTestReportValue,
  type ExecutionJobEvent,
  type ExecutionJobStateEvent,
  type ExecutionArtifact,
  type ExecutionValue,
} from '@prodivix/runtime-core';
import {
  createServerFunctionInvocationTrace,
  ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
  readExecutionServerFunctionBridgeRequest,
  SERVER_FUNCTION_INVOCATION_TRACE_NAME,
  toExecutionServerFunctionBridgeSuccess,
  toServerFunctionInvocationTraceValue,
} from '@prodivix/server-runtime';
import { describe, expect, it, vi } from 'vitest';
import { RemoteExecutionClientError } from './remoteExecutionClient';
import {
  createRemoteFixtureSnapshot,
  createRemoteServerFunctionFixtureRequest,
  createRemoteServerFunctionFixtureSnapshot,
  remoteServerFunctionFixtureRef,
} from './__tests__/remoteExecutionFixtures';
import {
  createRemoteBuildExecutionProvider,
  createRemotePreviewExecutionProvider,
  createRemoteServerFunctionExecutionProvider,
  createRemoteTestExecutionProvider,
  remotePreviewExecutionProviderDescriptor,
  remoteBuildExecutionProviderDescriptor,
  remoteServerFunctionExecutionProviderDescriptor,
  remoteTestExecutionProviderDescriptor,
} from './remoteExecutionProvider';
import type {
  RemoteExecutionClient,
  RemoteExecutionRecord,
} from './remoteExecutionProtocol.types';

const request = (requestId: string) =>
  createExecutionRequest({
    requestId,
    profile: 'build',
    runtimeZone: 'build',
    workspace: {
      workspaceId: 'workspace-1',
      snapshotId: 'snapshot-1',
      partitionRevisions: { workspace: '1' },
    },
    invocation: {
      kind: 'build',
      targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
    },
    requiredCapabilities: ['artifacts', 'build', 'filesystem'],
  });

const testRequest = (requestId: string) =>
  createExecutionRequest({
    requestId,
    profile: 'test',
    runtimeZone: 'test',
    workspace: {
      workspaceId: 'workspace-1',
      snapshotId: 'snapshot-1',
      partitionRevisions: { workspace: '1' },
    },
    invocation: {
      kind: 'test',
      targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
    },
    requiredCapabilities: [
      'artifacts',
      'filesystem',
      'server-function',
      'test',
    ],
  });

const previewRequest = (requestId: string) =>
  createExecutionRequest({
    requestId,
    profile: 'preview',
    runtimeZone: 'client',
    workspace: {
      workspaceId: 'workspace-1',
      snapshotId: 'snapshot-1',
      partitionRevisions: { workspace: '1' },
    },
    invocation: {
      kind: 'workspace',
      targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
    },
    requiredCapabilities: ['artifacts', 'filesystem'],
  });

const record = (
  requestId: string,
  status: RemoteExecutionRecord['status'],
  latestCursor: number
): RemoteExecutionRecord =>
  Object.freeze({
    executionId: `execution-${requestId}`,
    requestId,
    snapshotDigest: createRemoteFixtureSnapshot().contentDigest,
    provider: remoteBuildExecutionProviderDescriptor,
    status,
    latestCursor,
    createdAt: 1_000,
    ...(status === 'queued' ? {} : { startedAt: 1_001 }),
    ...(['succeeded', 'failed', 'cancelled', 'timed-out'].includes(status)
      ? { completedAt: 1_010 }
      : {}),
  });

const stateEvent = (
  execution: RemoteExecutionRecord,
  sequence: number,
  status: RemoteExecutionRecord['status'],
  previousStatus?: RemoteExecutionRecord['status']
): ExecutionJobStateEvent => ({
  kind: 'state',
  jobId: execution.executionId,
  sequence,
  emittedAt: execution.createdAt + sequence,
  ...(previousStatus ? { previousStatus } : {}),
  snapshot: {
    jobId: execution.executionId,
    requestId: execution.requestId,
    providerId: execution.provider.id,
    status,
    latestEventSequence: sequence,
    createdAt: execution.createdAt,
    ...(status === 'queued' ? {} : { startedAt: execution.createdAt + 1 }),
    ...(['succeeded', 'failed', 'cancelled', 'timed-out'].includes(status)
      ? { completedAt: execution.createdAt + sequence }
      : {}),
  },
});

const clientFor = (
  input: Readonly<{
    initial: RemoteExecutionRecord;
    events: readonly ExecutionJobEvent[];
    onCancel?: () => void;
    waitForEvents?: () => Promise<void>;
  }>
): RemoteExecutionClient => {
  const client: RemoteExecutionClient = {
    negotiate: async () => 1,
    create: async () => ({ execution: input.initial }),
    get: async () => {
      const finalEvent = input.events.at(-1);
      return record(
        input.initial.requestId,
        finalEvent?.kind === 'state'
          ? finalEvent.snapshot.status
          : input.initial.status,
        input.events.length
      );
    },
    cancel: async ({ executionId, cancellationId }) => {
      input.onCancel?.();
      return {
        executionId,
        cancellationId,
        result: { status: 'accepted' },
      };
    },
    readEvents: async ({ executionId, afterCursor }) => {
      await input.waitForEvents?.();
      const events = input.events.slice(afterCursor);
      return {
        executionId,
        providerId: input.initial.provider.id,
        afterCursor,
        latestCursor: input.events.length,
        hasMore: false,
        events: events.map((event) => ({
          cursor: event.sequence,
          event,
        })),
      };
    },
    resolveArtifact: async ({ executionId, artifactId }) => ({
      executionId,
      providerId: input.initial.provider.id,
      artifact: {
        artifactId,
        kind: 'bundle',
        mediaType: 'application/zip',
        size: 1,
        digest: `sha256-${'a'.repeat(64)}`,
        expiresAt: 2_000,
        authorizationScope: `execution:${executionId}`,
      },
    }),
  };
  return Object.freeze(client);
};

describe('remote ExecutionProvider conformance', () => {
  it('keeps Preview, Test, Build, and Server Function provider identities independent', () => {
    expect(
      new Set([
        remotePreviewExecutionProviderDescriptor.id,
        remoteTestExecutionProviderDescriptor.id,
        remoteBuildExecutionProviderDescriptor.id,
        remoteServerFunctionExecutionProviderDescriptor.id,
      ]).size
    ).toBe(4);
    expect(remotePreviewExecutionProviderDescriptor.profiles).toEqual([
      'preview',
    ]);
    expect(remotePreviewExecutionProviderDescriptor.capabilities).toContain(
      'environment-binding'
    );
    expect(remoteTestExecutionProviderDescriptor.profiles).toEqual(['test']);
    expect(remoteBuildExecutionProviderDescriptor.profiles).toEqual(['build']);
    expect(remoteServerFunctionExecutionProviderDescriptor).toMatchObject({
      profiles: ['production'],
      runtimeZones: ['server'],
      invocationKinds: ['code'],
    });
    expect(
      remoteServerFunctionExecutionProviderDescriptor.capabilities
    ).not.toContain('network');
  });

  it('accepts one exact isolated Server Function result artifact', async () => {
    const snapshot = createRemoteServerFunctionFixtureSnapshot();
    const executionRequest = createRemoteServerFunctionFixtureRequest();
    const invocation = readExecutionServerFunctionBridgeRequest(
      executionRequest.invocation.input
    );
    if (!invocation) throw new Error('Fixture invocation is invalid.');
    const sourceTrace = [
      {
        sourceRef: {
          kind: 'code-artifact' as const,
          artifactId: remoteServerFunctionFixtureRef.artifactId,
        },
      },
    ];
    const invocationTrace = createServerFunctionInvocationTrace({
      request: invocation,
      response: toExecutionServerFunctionBridgeSuccess(invocation.requestId, {
        kind: 'value',
        value: null,
      }),
      startedAt: 1_001,
      completedAt: 1_004,
    });
    const initial: RemoteExecutionRecord = Object.freeze({
      executionId: 'execution-server-function-success',
      requestId: executionRequest.requestId,
      snapshotDigest: snapshot.contentDigest,
      provider: remoteServerFunctionExecutionProviderDescriptor,
      status: 'running',
      latestCursor: 5,
      createdAt: 1_000,
      startedAt: 1_001,
    });
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      {
        kind: 'artifact',
        jobId: initial.executionId,
        sequence: 3,
        emittedAt: 1_003,
        artifact: {
          artifactId: `server-function-result:${snapshot.contentDigest}:${invocation.requestId}`,
          kind: 'report',
          mediaType: ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
          sourceTrace,
          metadata: {
            snapshotDigest: snapshot.contentDigest,
            requestId: invocation.requestId,
            artifactId: remoteServerFunctionFixtureRef.artifactId,
            exportName: remoteServerFunctionFixtureRef.exportName,
            status: 'succeeded',
          },
        },
      },
      {
        kind: 'trace',
        jobId: initial.executionId,
        sequence: 4,
        emittedAt: 1_004,
        trace: {
          traceId: `server-function:${initial.executionId}`,
          spanId: invocation.requestId,
          name: SERVER_FUNCTION_INVOCATION_TRACE_NAME,
          phase: 'event',
          detail: toServerFunctionInvocationTraceValue(invocationTrace),
          sourceTrace,
        },
      },
      stateEvent(initial, 5, 'succeeded', 'running'),
    ];
    const materializeArtifact = vi.fn(
      async ({ artifact }: { artifact: ExecutionArtifact }) => ({
        ...artifact,
        uri: 'https://artifacts.example.test/server-function-result',
      })
    );
    const provider = createRemoteServerFunctionExecutionProvider({
      client: clientFor({ initial, events }),
      resolveSnapshot: () => ({ kind: 'upload', snapshot }),
      delay: async () => undefined,
      materializeArtifact,
    });

    const job = await provider.start(executionRequest);
    await expect(job.completion).resolves.toMatchObject({
      status: 'succeeded',
      artifacts: [
        {
          kind: 'report',
          mediaType: ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
          metadata: { status: 'succeeded' },
          uri: 'https://artifacts.example.test/server-function-result',
        },
      ],
    });
    expect(materializeArtifact).toHaveBeenCalledTimes(1);
  });

  it('fails closed when isolated Server Function success omits its correlated trace', async () => {
    const snapshot = createRemoteServerFunctionFixtureSnapshot();
    const executionRequest = createRemoteServerFunctionFixtureRequest(
      'server-function-missing-trace'
    );
    const invocation = readExecutionServerFunctionBridgeRequest(
      executionRequest.invocation.input
    );
    if (!invocation) throw new Error('Fixture invocation is invalid.');
    const initial: RemoteExecutionRecord = Object.freeze({
      executionId: 'execution-server-function-missing-trace',
      requestId: executionRequest.requestId,
      snapshotDigest: snapshot.contentDigest,
      provider: remoteServerFunctionExecutionProviderDescriptor,
      status: 'running',
      latestCursor: 4,
      createdAt: 1_000,
      startedAt: 1_001,
    });
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      {
        kind: 'artifact',
        jobId: initial.executionId,
        sequence: 3,
        emittedAt: 1_003,
        artifact: {
          artifactId: `server-function-result:${snapshot.contentDigest}:${invocation.requestId}`,
          kind: 'report',
          mediaType: ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
          sourceTrace: [
            {
              sourceRef: {
                kind: 'code-artifact',
                artifactId: remoteServerFunctionFixtureRef.artifactId,
              },
            },
          ],
          metadata: {
            snapshotDigest: snapshot.contentDigest,
            requestId: invocation.requestId,
            artifactId: remoteServerFunctionFixtureRef.artifactId,
            exportName: remoteServerFunctionFixtureRef.exportName,
            status: 'succeeded',
          },
        },
      },
      stateEvent(initial, 4, 'succeeded', 'running'),
    ];
    const provider = createRemoteServerFunctionExecutionProvider({
      client: clientFor({ initial, events }),
      resolveSnapshot: () => ({ kind: 'upload', snapshot }),
      delay: async () => undefined,
    });

    const job = await provider.start(executionRequest);
    await expect(job.completion).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'REMOTE_EXECUTION_SYNC_FAILED' },
    });
  });

  it('fails closed when Remote Server Function result identity drifts', async () => {
    const snapshot = createRemoteServerFunctionFixtureSnapshot();
    const executionRequest = createRemoteServerFunctionFixtureRequest(
      'server-function-drift'
    );
    const invocation = executionRequest.invocation.input as Readonly<{
      requestId: string;
    }>;
    const initial: RemoteExecutionRecord = Object.freeze({
      executionId: 'execution-server-function-drift',
      requestId: executionRequest.requestId,
      snapshotDigest: snapshot.contentDigest,
      provider: remoteServerFunctionExecutionProviderDescriptor,
      status: 'running',
      latestCursor: 4,
      createdAt: 1_000,
      startedAt: 1_001,
    });
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      {
        kind: 'artifact',
        jobId: initial.executionId,
        sequence: 3,
        emittedAt: 1_003,
        artifact: {
          artifactId: `server-function-result:${snapshot.contentDigest}:${invocation.requestId}`,
          kind: 'report',
          mediaType: ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
          sourceTrace: [
            {
              sourceRef: {
                kind: 'code-artifact',
                artifactId: remoteServerFunctionFixtureRef.artifactId,
              },
            },
          ],
          metadata: {
            snapshotDigest: snapshot.contentDigest,
            requestId: invocation.requestId,
            artifactId: remoteServerFunctionFixtureRef.artifactId,
            exportName: 'differentExport',
            status: 'succeeded',
          },
        },
      },
      stateEvent(initial, 4, 'succeeded', 'running'),
    ];
    const provider = createRemoteServerFunctionExecutionProvider({
      client: clientFor({ initial, events }),
      resolveSnapshot: () => ({ kind: 'upload', snapshot }),
      delay: async () => undefined,
    });

    const job = await provider.start(executionRequest);
    await expect(job.completion).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'REMOTE_EXECUTION_SYNC_FAILED' },
    });
  });

  it('projects durable events and terminal results into a canonical Job', async () => {
    const initial = record('build-success', 'running', 5);
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      {
        kind: 'log',
        jobId: initial.executionId,
        sequence: 3,
        emittedAt: 1_003,
        log: { stream: 'stdout', level: 'info', message: 'building' },
      },
      {
        kind: 'artifact',
        jobId: initial.executionId,
        sequence: 4,
        emittedAt: 1_004,
        artifact: {
          artifactId: 'bundle-1',
          kind: 'bundle',
          mediaType: 'application/vnd.prodivix.execution-build-bundle+json',
          sourceTrace: [
            {
              sourceRef: { kind: 'workspace', workspaceId: 'workspace-1' },
            },
          ],
          metadata: { snapshotDigest: initial.snapshotDigest },
        },
      },
      stateEvent(initial, 5, 'succeeded', 'running'),
    ];
    const provider = createRemoteBuildExecutionProvider({
      client: clientFor({ initial, events }),
      resolveSnapshot: () => ({
        kind: 'upload',
        snapshot: createRemoteFixtureSnapshot(),
      }),
      delay: async () => undefined,
    });

    const job = await provider.start(request('build-success'));
    const observed: ExecutionJobEvent[] = [];
    job.subscribe((event) => observed.push(event));
    const result = await job.completion;

    expect(result.status).toBe('succeeded');
    expect(result.artifacts).toHaveLength(1);
    expect(observed.some((event) => event.kind === 'log')).toBe(true);
    expect(job.provider).toBe(remoteBuildExecutionProviderDescriptor);
  });

  it('reconnects the same execution and replays from the last confirmed cursor', async () => {
    const initial = record('build-reconnect', 'running', 4);
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      {
        kind: 'artifact',
        jobId: initial.executionId,
        sequence: 3,
        emittedAt: 1_003,
        artifact: {
          artifactId: 'bundle-reconnect',
          kind: 'bundle',
          mediaType: 'application/vnd.prodivix.execution-build-bundle+json',
          sourceTrace: [
            { sourceRef: { kind: 'workspace', workspaceId: 'workspace-1' } },
          ],
          metadata: { snapshotDigest: initial.snapshotDigest },
        },
      },
      stateEvent(initial, 4, 'succeeded', 'running'),
    ];
    const stableClient = clientFor({ initial, events });
    let disconnected = true;
    const readEvents = vi.fn(async (input) => {
      if (disconnected) {
        disconnected = false;
        throw new RemoteExecutionClientError(
          { code: 'unavailable', message: 'disconnected', retryable: true },
          'events.read'
        );
      }
      return stableClient.readEvents(input);
    });
    const provider = createRemoteBuildExecutionProvider({
      client: Object.freeze({ ...stableClient, readEvents }),
      resolveSnapshot: () => ({
        kind: 'upload',
        snapshot: createRemoteFixtureSnapshot(),
      }),
      delay: async () => undefined,
      maximumReconnectAttempts: 2,
    });

    const job = await provider.start(request('build-reconnect'));
    await expect(job.completion).resolves.toMatchObject({
      status: 'succeeded',
      artifacts: [{ artifactId: 'bundle-reconnect' }],
    });
    expect(readEvents).toHaveBeenCalledTimes(3);
    expect(readEvents.mock.calls.map(([call]) => call.afterCursor)).toEqual([
      0, 0, 0,
    ]);
  });

  it('surfaces authorization loss as an explicit restore-access recovery', async () => {
    const initial = record('build-authorization-loss', 'running', 0);
    const stableClient = clientFor({ initial, events: [] });
    const provider = createRemoteBuildExecutionProvider({
      client: Object.freeze({
        ...stableClient,
        readEvents: async () => {
          throw new RemoteExecutionClientError(
            { code: 'unauthorized', message: 'expired', retryable: false },
            'events.read'
          );
        },
      }),
      resolveSnapshot: () => ({
        kind: 'upload',
        snapshot: createRemoteFixtureSnapshot(),
      }),
      delay: async () => undefined,
    });

    const job = await provider.start(request('build-authorization-loss'));
    await expect(job.completion).resolves.toMatchObject({
      status: 'failed',
      failure: {
        code: 'REMOTE_AUTHORIZATION_REQUIRED',
        retryable: false,
      },
      diagnostics: [{ code: 'EXE-4011' }],
    });
  });

  it('projects network and binding policy denial as non-retryable repair paths', async () => {
    for (const [reason, code] of [
      ['network-policy-denied', 'REMOTE_NETWORK_POLICY_DENIED'],
      ['secret-resolution-denied', 'REMOTE_PERMISSION_DENIED'],
    ] as const) {
      const initial = record(`build-${reason}`, 'running', 3);
      const events: ExecutionJobEvent[] = [
        stateEvent(initial, 1, 'queued'),
        stateEvent(initial, 2, 'running', 'queued'),
        {
          ...stateEvent(initial, 3, 'failed', 'running'),
          reason,
        },
      ];
      const provider = createRemoteBuildExecutionProvider({
        client: clientFor({ initial, events }),
        resolveSnapshot: () => ({
          kind: 'upload',
          snapshot: createRemoteFixtureSnapshot(),
        }),
        delay: async () => undefined,
      });

      const job = await provider.start(request(`build-${reason}`));
      await expect(job.completion).resolves.toMatchObject({
        status: 'failed',
        failure: { code, retryable: false },
      });
    }
  });

  it('projects a redaction-safe diagnostic when protected output was blocked', async () => {
    const initial = record('build-secret-leak', 'running', 3);
    const failed = stateEvent(initial, 3, 'failed', 'running');
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      { ...failed, reason: 'secret-material-detected' },
    ];
    const provider = createRemoteBuildExecutionProvider({
      client: clientFor({ initial, events }),
      resolveSnapshot: () => ({
        kind: 'upload',
        snapshot: createRemoteFixtureSnapshot(),
      }),
      delay: async () => undefined,
    });

    const job = await provider.start(request('build-secret-leak'));
    await expect(job.completion).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'EXECUTION_SECRET_LEAK_BLOCKED' },
      diagnostics: [{ code: 'EXE-5004', severity: 'fatal' }],
    });
    expect(JSON.stringify(await job.completion)).not.toContain(
      'secret-material-detected'
    );
  });

  it('accepts cancellation before stale running events are replayed', async () => {
    const initial = record('build-cancel', 'running', 2);
    let cancelled = false;
    let releaseEvents: () => void = () => undefined;
    const cancellation = new Promise<void>((resolve) => {
      releaseEvents = resolve;
    });
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      stateEvent(initial, 3, 'cancelled', 'running'),
    ];
    const provider = createRemoteBuildExecutionProvider({
      client: clientFor({
        initial,
        events,
        onCancel: () => {
          cancelled = true;
          releaseEvents();
        },
        waitForEvents: async () => cancellation,
      }),
      resolveSnapshot: () => ({
        kind: 'upload',
        snapshot: createRemoteFixtureSnapshot(),
      }),
      delay: async () => undefined,
    });

    const job = await provider.start(request('build-cancel'));
    await expect(job.cancel({ reason: 'user stop' })).resolves.toMatchObject({
      status: 'accepted',
    });
    await expect(job.completion).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(cancelled).toBe(true);
  });

  it('fails closed when the router selects a drifted provider contract', async () => {
    const initial = {
      ...record('build-drift', 'queued', 0),
      provider: {
        ...remoteBuildExecutionProviderDescriptor,
        capabilities: ['build'] as const,
      },
    };
    const provider = createRemoteBuildExecutionProvider({
      client: clientFor({ initial, events: [] }),
      resolveSnapshot: () => ({
        kind: 'upload',
        snapshot: createRemoteFixtureSnapshot(),
      }),
    });

    await expect(provider.start(request('build-drift'))).rejects.toThrow(
      'unexpected provider identity'
    );
  });

  it('fails closed when Remote Build succeeds without a verified bundle', async () => {
    const initial = record('build-missing-bundle', 'running', 3);
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      stateEvent(initial, 3, 'succeeded', 'running'),
    ];
    const provider = createRemoteBuildExecutionProvider({
      client: clientFor({ initial, events }),
      resolveSnapshot: () => ({
        kind: 'upload',
        snapshot: createRemoteFixtureSnapshot(),
      }),
      delay: async () => undefined,
    });

    const job = await provider.start(request('build-missing-bundle'));
    await expect(job.completion).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'REMOTE_EXECUTION_SYNC_FAILED' },
      diagnostics: [
        {
          code: 'EXE-4092',
        },
      ],
    });
  });

  it('accepts Remote Preview success only with a healthy ready bundle', async () => {
    const buildRecord = record('preview-success', 'running', 5);
    const initial: RemoteExecutionRecord = {
      ...buildRecord,
      provider: remotePreviewExecutionProviderDescriptor,
    };
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      {
        kind: 'artifact',
        jobId: initial.executionId,
        sequence: 3,
        emittedAt: 1_003,
        artifact: {
          artifactId: 'preview-bundle',
          kind: 'bundle',
          mediaType: 'application/vnd.prodivix.execution-preview-bundle+json',
          size: 128,
          digest: `sha256-${'b'.repeat(64)}`,
          sourceTrace: [
            {
              sourceRef: { kind: 'workspace', workspaceId: 'workspace-1' },
            },
          ],
          metadata: {
            snapshotDigest: initial.snapshotDigest,
            readiness: 'ready',
            health: 'healthy',
            entryFilePath: 'index.html',
          },
        },
      },
      {
        kind: 'artifact',
        jobId: initial.executionId,
        sequence: 4,
        emittedAt: 1_004,
        artifact: {
          artifactId: `filesystem-diff:${initial.snapshotDigest}`,
          kind: 'report',
          mediaType: 'application/vnd.prodivix.execution-filesystem-diff+json',
          size: 64,
          digest: `sha256-${'c'.repeat(64)}`,
          metadata: {
            format: 'prodivix.execution-filesystem-diff.v1',
            snapshotDigest: initial.snapshotDigest,
            workspaceSnapshotId: 'snapshot-1',
            changeCount: '0',
            complete: 'true',
          },
        },
      },
      stateEvent(initial, 5, 'succeeded', 'running'),
    ];
    const materializeArtifact = vi.fn(
      async ({ artifact }: { artifact: ExecutionArtifact }) => ({
        ...artifact,
        uri: 'https://preview.example.test/',
      })
    );
    const provider = createRemotePreviewExecutionProvider({
      client: clientFor({ initial, events }),
      resolveSnapshot: () => ({
        kind: 'upload',
        snapshot: createRemoteFixtureSnapshot(),
      }),
      delay: async () => undefined,
      materializeArtifact,
    });

    const job = await provider.start(previewRequest('preview-success'));
    const completion = await job.completion;
    expect(completion).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        artifacts: expect.arrayContaining([
          expect.objectContaining({
            kind: 'bundle',
            uri: 'https://preview.example.test/',
            metadata: expect.objectContaining({
              readiness: 'ready',
              health: 'healthy',
            }),
          }),
        ]),
      })
    );
    expect(materializeArtifact).toHaveBeenCalledTimes(1);
    expect(
      completion.status === 'succeeded' ? completion.artifacts : []
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'report',
          mediaType: 'application/vnd.prodivix.execution-filesystem-diff+json',
        }),
      ])
    );
  });

  it('fails closed when Remote Preview reports unhealthy readiness', async () => {
    const buildRecord = record('preview-unhealthy', 'running', 4);
    const initial: RemoteExecutionRecord = {
      ...buildRecord,
      provider: remotePreviewExecutionProviderDescriptor,
    };
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      {
        kind: 'artifact',
        jobId: initial.executionId,
        sequence: 3,
        emittedAt: 1_003,
        artifact: {
          artifactId: 'preview-bundle',
          kind: 'bundle',
          mediaType: 'application/vnd.prodivix.execution-preview-bundle+json',
          sourceTrace: [
            {
              sourceRef: { kind: 'workspace', workspaceId: 'workspace-1' },
            },
          ],
          metadata: {
            snapshotDigest: initial.snapshotDigest,
            readiness: 'ready',
            health: 'unhealthy',
            entryFilePath: 'index.html',
          },
        },
      },
      stateEvent(initial, 4, 'succeeded', 'running'),
    ];
    const provider = createRemotePreviewExecutionProvider({
      client: clientFor({ initial, events }),
      resolveSnapshot: () => ({
        kind: 'upload',
        snapshot: createRemoteFixtureSnapshot(),
      }),
      delay: async () => undefined,
    });

    const job = await provider.start(previewRequest('preview-unhealthy'));
    await expect(job.completion).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'REMOTE_EXECUTION_SYNC_FAILED' },
    });
  });

  it('accepts a trusted Remote Test Server Function trace and rejects widened or drifted traces', async () => {
    const buildRecord = record('test-success', 'running', 6);
    const initial: RemoteExecutionRecord = {
      ...buildRecord,
      provider: remoteTestExecutionProviderDescriptor,
    };
    const reportId = `test-report:${initial.executionId}`;
    const sourceTrace = [
      {
        sourceRef: {
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
        },
      },
    ];
    const report = createExecutionTestReport({
      reportId,
      tool: { name: 'vitest' },
      completedAt: 1_003,
      files: [
        {
          fileId: 'src/App.test.tsx',
          path: 'src/App.test.tsx',
          status: 'passed',
          cases: [
            {
              caseId: 'src/App.test.tsx#1',
              name: 'renders',
              status: 'passed',
            },
          ],
        },
      ],
    });
    const invocationRequest = {
      requestId: 'test-load-principal:1',
      invocationId: 'test-load-principal',
      attempt: 1,
      functionRef: {
        artifactId: 'code-auth',
        exportName: 'loadPrincipal',
      },
    } as const;
    const invocationTrace = createServerFunctionInvocationTrace({
      request: invocationRequest,
      response: toExecutionServerFunctionBridgeSuccess(
        invocationRequest.requestId,
        { kind: 'value', value: { credential: 'not-projected' } }
      ),
      startedAt: 1_003,
      completedAt: 1_004,
    });
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      {
        kind: 'artifact',
        jobId: initial.executionId,
        sequence: 3,
        emittedAt: 1_003,
        artifact: {
          artifactId: reportId,
          kind: 'report',
          mediaType: 'application/vnd.prodivix.test-report+json',
          sourceTrace,
          metadata: {
            reportId,
            status: 'passed',
            snapshotDigest: initial.snapshotDigest,
          },
        },
      },
      {
        kind: 'trace',
        jobId: initial.executionId,
        sequence: 4,
        emittedAt: 1_004,
        trace: {
          traceId: `test:${initial.executionId}`,
          spanId: reportId,
          name: 'test.report',
          phase: 'event',
          detail: toExecutionTestReportValue(report),
          sourceTrace,
        },
      },
      {
        kind: 'trace',
        jobId: initial.executionId,
        sequence: 5,
        emittedAt: 1_005,
        trace: {
          traceId: `server-function-test:${initial.executionId}`,
          spanId: `${invocationTrace.requestId}:0`,
          name: 'server.function',
          phase: 'event',
          detail: toServerFunctionInvocationTraceValue(invocationTrace),
          sourceTrace: [
            {
              sourceRef: {
                kind: 'code-artifact',
                artifactId: 'code-auth',
              },
            },
          ],
        },
      },
      stateEvent(initial, 6, 'succeeded', 'running'),
    ];
    const provider = createRemoteTestExecutionProvider({
      client: clientFor({ initial, events }),
      resolveSnapshot: () => ({
        kind: 'upload',
        snapshot: createRemoteFixtureSnapshot(),
      }),
      delay: async () => undefined,
    });

    const job = await provider.start(testRequest('test-success'));
    const observed: ExecutionJobEvent[] = [];
    job.subscribe((event) => observed.push(event));
    await expect(job.completion).resolves.toMatchObject({
      status: 'succeeded',
      artifacts: [
        {
          kind: 'report',
          metadata: { status: 'passed' },
        },
      ],
    });
    expect(observed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'trace',
          trace: expect.objectContaining({
            name: 'server.function',
            detail: expect.objectContaining({
              requestId: 'test-load-principal:1',
              redacted: true,
            }),
          }),
        }),
      ])
    );
    expect(JSON.stringify(observed)).not.toContain('not-projected');

    const serverFunctionEvent = events.find(
      (event) =>
        event.kind === 'trace' && event.trace.name === 'server.function'
    );
    if (!serverFunctionEvent || serverFunctionEvent.kind !== 'trace')
      throw new Error('Expected the Server Function fixture event.');
    const detail = serverFunctionEvent.trace.detail as Readonly<
      Record<string, ExecutionValue>
    >;
    const invalidServerFunctionEvents: readonly ExecutionJobEvent[] = [
      {
        ...serverFunctionEvent,
        trace: {
          ...serverFunctionEvent.trace,
          detail: { ...detail, credential: 'must-be-rejected' },
        },
      },
      {
        ...serverFunctionEvent,
        trace: {
          ...serverFunctionEvent.trace,
          detail: {
            ...detail,
            functionRef: {
              artifactId: 'code-drift',
              exportName: 'loadPrincipal',
            },
          },
          sourceTrace: [
            {
              sourceRef: {
                kind: 'code-artifact',
                artifactId: 'code-drift',
              },
            },
          ],
        },
      },
    ];
    for (const invalidServerFunctionEvent of invalidServerFunctionEvents) {
      const invalidProvider = createRemoteTestExecutionProvider({
        client: clientFor({
          initial,
          events: events.map((event) =>
            event === serverFunctionEvent ? invalidServerFunctionEvent : event
          ),
        }),
        resolveSnapshot: () => ({
          kind: 'upload',
          snapshot: createRemoteFixtureSnapshot(),
        }),
        delay: async () => undefined,
      });
      const invalidJob = await invalidProvider.start(
        testRequest('test-success')
      );
      await expect(invalidJob.completion).resolves.toMatchObject({
        status: 'failed',
        failure: { code: 'REMOTE_EXECUTION_SYNC_FAILED' },
      });
    }
  });

  it('fails closed when Remote Test succeeds without a report', async () => {
    const buildRecord = record('test-missing-report', 'running', 3);
    const initial: RemoteExecutionRecord = {
      ...buildRecord,
      provider: remoteTestExecutionProviderDescriptor,
    };
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      stateEvent(initial, 3, 'succeeded', 'running'),
    ];
    const provider = createRemoteTestExecutionProvider({
      client: clientFor({ initial, events }),
      resolveSnapshot: () => ({
        kind: 'upload',
        snapshot: createRemoteFixtureSnapshot(),
      }),
      delay: async () => undefined,
    });

    const job = await provider.start(testRequest('test-missing-report'));
    await expect(job.completion).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'REMOTE_EXECUTION_SYNC_FAILED' },
    });
  });

  it('rejects a Remote Test environment before snapshot resolution or create', async () => {
    const initial: RemoteExecutionRecord = {
      ...record('test-live-environment', 'queued', 0),
      provider: remoteTestExecutionProviderDescriptor,
    };
    const resolveSnapshot = vi.fn(() => ({
      kind: 'upload' as const,
      snapshot: createRemoteFixtureSnapshot(),
    }));
    const provider = createRemoteTestExecutionProvider({
      client: clientFor({ initial, events: [] }),
      resolveSnapshot,
      delay: async () => undefined,
    });
    const liveRequest = createExecutionRequest({
      requestId: 'test-live-environment',
      profile: 'test',
      runtimeZone: 'test',
      workspace: {
        workspaceId: 'workspace-1',
        snapshotId: 'snapshot-1',
        partitionRevisions: { workspace: '1' },
      },
      environment: {
        environmentId: 'environment-1',
        revision: 'revision-1',
        mode: 'live',
      },
      invocation: {
        kind: 'test',
        targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
      },
      requiredCapabilities: ['artifacts', 'filesystem', 'test'],
    });

    await expect(provider.start(liveRequest)).rejects.toThrow(/mock-only/iu);
    expect(resolveSnapshot).not.toHaveBeenCalled();
  });

  it('fails closed when a Remote Test event claims live runtime network access', async () => {
    const initial: RemoteExecutionRecord = {
      ...record('test-live-network', 'running', 4),
      provider: remoteTestExecutionProviderDescriptor,
    };
    const network = createExecutionNetworkTrace({
      requestId: 'test-live-network-request',
      phase: 'runtime',
      runtimeZone: 'test',
      mode: 'live',
      adapter: 'data-http',
      method: 'GET',
      sanitizedUrl: 'https://api.example.test/',
      protocol: 'https',
      startedAt: 1_002,
      completedAt: 1_003,
      outcome: 'allowed',
      status: 200,
      correlation: {
        kind: 'data-operation',
        documentId: 'data-1',
        operationId: 'list-items',
        invocationId: 'invocation-1',
        sequence: 0,
        attempt: 1,
      },
    });
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      {
        kind: 'trace',
        jobId: initial.executionId,
        sequence: 3,
        emittedAt: 1_003,
        trace: {
          traceId: `network:${initial.executionId}`,
          spanId: network.requestId,
          name: 'network.request',
          phase: 'event',
          detail: toExecutionNetworkTraceValue(network),
        },
      },
      stateEvent(initial, 4, 'failed', 'running'),
    ];
    const provider = createRemoteTestExecutionProvider({
      client: clientFor({ initial, events }),
      resolveSnapshot: () => ({
        kind: 'upload',
        snapshot: createRemoteFixtureSnapshot(),
      }),
      delay: async () => undefined,
    });

    const job = await provider.start(testRequest('test-live-network'));
    await expect(job.completion).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'REMOTE_EXECUTION_SYNC_FAILED' },
    });
  });

  it('preserves a failed canonical report when Remote Test fails', async () => {
    const buildRecord = record('test-failed', 'running', 5);
    const initial: RemoteExecutionRecord = {
      ...buildRecord,
      provider: remoteTestExecutionProviderDescriptor,
    };
    const sourceTrace = [
      {
        sourceRef: {
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
        },
      },
    ];
    const reportId = `test-report:${initial.executionId}`;
    const failedReport = createExecutionTestReport({
      reportId,
      tool: { name: 'vitest' },
      files: [
        {
          fileId: 'src/App.test.tsx',
          path: 'src/App.test.tsx',
          status: 'failed',
          cases: [
            {
              caseId: 'src/App.test.tsx#1',
              name: 'renders',
              status: 'failed',
              failureMessages: ['assertion failed'],
            },
          ],
        },
      ],
    });
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      {
        kind: 'artifact',
        jobId: initial.executionId,
        sequence: 3,
        emittedAt: 1_003,
        artifact: {
          artifactId: reportId,
          kind: 'report',
          mediaType: 'application/vnd.prodivix.test-report+json',
          sourceTrace,
          metadata: {
            reportId,
            status: 'failed',
            snapshotDigest: initial.snapshotDigest,
          },
        },
      },
      {
        kind: 'trace',
        jobId: initial.executionId,
        sequence: 4,
        emittedAt: 1_004,
        trace: {
          traceId: `test:${initial.executionId}`,
          spanId: reportId,
          name: 'test.report',
          phase: 'event',
          detail: toExecutionTestReportValue(failedReport),
          sourceTrace,
        },
      },
      stateEvent(initial, 5, 'failed', 'running'),
    ];
    const provider = createRemoteTestExecutionProvider({
      client: clientFor({ initial, events }),
      resolveSnapshot: () => ({
        kind: 'upload',
        snapshot: createRemoteFixtureSnapshot(),
      }),
      delay: async () => undefined,
    });

    const job = await provider.start(testRequest('test-failed'));
    const traces: ExecutionJobEvent[] = [];
    job.subscribe((event) => traces.push(event));
    await expect(job.completion).resolves.toMatchObject({
      status: 'failed',
      artifacts: [{ metadata: { status: 'failed' } }],
    });
    expect(
      traces.find(
        (event) => event.kind === 'trace' && event.trace.name === 'test.report'
      )
    ).toMatchObject({
      kind: 'trace',
      trace: { detail: { kind: 'test-report', status: 'failed' } },
    });
  });
});
