import {
  createExecutionTestReport,
  createExecutionRequest,
  toExecutionTestReportValue,
  type ExecutionJobEvent,
  type ExecutionJobStateEvent,
  type ExecutionArtifact,
} from '@prodivix/runtime-core';
import { describe, expect, it, vi } from 'vitest';
import { createRemoteFixtureSnapshot } from './__tests__/remoteExecutionFixtures';
import {
  createRemoteBuildExecutionProvider,
  createRemotePreviewExecutionProvider,
  createRemoteTestExecutionProvider,
  remotePreviewExecutionProviderDescriptor,
  remoteBuildExecutionProviderDescriptor,
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
    requiredCapabilities: ['artifacts', 'filesystem', 'test'],
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
  it('keeps Preview, Test, and Build provider identities independent', () => {
    expect(
      new Set([
        remotePreviewExecutionProviderDescriptor.id,
        remoteTestExecutionProviderDescriptor.id,
        remoteBuildExecutionProviderDescriptor.id,
      ]).size
    ).toBe(3);
    expect(remotePreviewExecutionProviderDescriptor.profiles).toEqual([
      'preview',
    ]);
    expect(remotePreviewExecutionProviderDescriptor.capabilities).toContain(
      'environment-binding'
    );
    expect(remoteTestExecutionProviderDescriptor.profiles).toEqual(['test']);
    expect(remoteBuildExecutionProviderDescriptor.profiles).toEqual(['build']);
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

  it('accepts Remote Test success only with a passing canonical report', async () => {
    const buildRecord = record('test-success', 'running', 5);
    const initial: RemoteExecutionRecord = {
      ...buildRecord,
      provider: remoteTestExecutionProviderDescriptor,
    };
    const events: ExecutionJobEvent[] = [
      stateEvent(initial, 1, 'queued'),
      stateEvent(initial, 2, 'running', 'queued'),
      {
        kind: 'trace',
        jobId: initial.executionId,
        sequence: 3,
        emittedAt: 1_003,
        trace: {
          traceId: `test:${initial.executionId}`,
          spanId: `test-report:${initial.executionId}`,
          name: 'test.report',
          phase: 'event',
          detail: toExecutionTestReportValue(
            createExecutionTestReport({
              reportId: 'report-1',
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
            })
          ),
          sourceTrace: [
            {
              sourceRef: { kind: 'workspace', workspaceId: 'workspace-1' },
            },
          ],
        },
      },
      {
        kind: 'artifact',
        jobId: initial.executionId,
        sequence: 4,
        emittedAt: 1_004,
        artifact: {
          artifactId: 'test-report',
          kind: 'report',
          mediaType: 'application/vnd.prodivix.test-report+json',
          sourceTrace: [
            {
              sourceRef: { kind: 'workspace', workspaceId: 'workspace-1' },
            },
          ],
          metadata: {
            status: 'passed',
            snapshotDigest: initial.snapshotDigest,
          },
        },
      },
      stateEvent(initial, 5, 'succeeded', 'running'),
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
    await expect(job.completion).resolves.toMatchObject({
      status: 'succeeded',
      artifacts: [
        {
          kind: 'report',
          metadata: { status: 'passed' },
        },
      ],
    });
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
    const failedReport = createExecutionTestReport({
      reportId: 'report-failed',
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
        kind: 'trace',
        jobId: initial.executionId,
        sequence: 3,
        emittedAt: 1_003,
        trace: {
          traceId: `test:${initial.executionId}`,
          spanId: `test-report:${initial.executionId}`,
          name: 'test.report',
          phase: 'event',
          detail: toExecutionTestReportValue(failedReport),
          sourceTrace,
        },
      },
      {
        kind: 'artifact',
        jobId: initial.executionId,
        sequence: 4,
        emittedAt: 1_004,
        artifact: {
          artifactId: 'test-report-failed',
          kind: 'report',
          mediaType: 'application/vnd.prodivix.test-report+json',
          sourceTrace,
          metadata: {
            status: 'failed',
            snapshotDigest: initial.snapshotDigest,
          },
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
