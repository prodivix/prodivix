import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createExecutionJobController,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  type ExecutableProjectSnapshot,
  type ExecutionJob,
} from '@prodivix/runtime-core';

const host = vi.hoisted(() => ({
  start: vi.fn(),
  activate: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('@prodivix/runtime-browser', () => ({
  createBrowserProjectTestRunner: () => ({
    provider: { start: host.start },
    stop: host.stop,
  }),
}));
vi.mock('@/editor/features/execution', () => ({
  browserProjectRuntimeHost: {},
  createRemoteProjectExecutionEnvironment: () => ({
    testProvider: { start: host.start },
  }),
  executionSessionCoordinator: { activate: host.activate },
  resolveBrowserProjectExecutionSnapshot: vi.fn(),
  retainBrowserProjectExecutionSnapshot: () => vi.fn(),
}));
import {
  startProjectTests,
  stopProjectTests,
} from './projectTestExecutionClient';

const request = createExecutionRequest({
  requestId: 'test-startup',
  profile: 'test',
  runtimeZone: 'test',
  workspace: { workspaceId: 'workspace', snapshotId: 'snapshot' },
  invocation: {
    kind: 'test',
    targetRef: { kind: 'workspace', workspaceId: 'workspace' },
  },
});
const snapshot = { workspace: request.workspace } as ExecutableProjectSnapshot;
const descriptor = createExecutionProviderDescriptor({
  id: 'test',
  version: '1',
  isolation: 'remote-isolated',
  profiles: ['test'],
  runtimeZones: ['test'],
  invocationKinds: ['test'],
  capabilities: ['cancellation'],
});
const createJob = () => {
  const cancellation = vi.fn(() => {
    controller.finishCancelled();
    return 'accepted' as const;
  });
  const controller = createExecutionJobController({
    jobId: 'job',
    request,
    provider: descriptor,
    requestCancellation: cancellation,
  });
  return { controller, cancellation };
};

describe('Workspace Test pending startup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['signal', 'stop'] as const)(
    'cancels a late Remote Job after %s without activating it',
    async (source) => {
      let resolve!: (job: ExecutionJob) => void;
      host.start.mockReturnValueOnce(
        new Promise<ExecutionJob>((settle) => {
          resolve = settle;
        })
      );
      const signal = new AbortController();
      const started = startProjectTests(snapshot, request, {
        provider: 'remote',
        accessToken: 'session',
        signal: signal.signal,
      });
      const rejected = expect(started).rejects.toMatchObject({
        name: 'AbortError',
      });
      if (source === 'signal') signal.abort();
      else await stopProjectTests();
      const { controller, cancellation } = createJob();
      resolve(controller.job);
      await rejected;
      expect(cancellation).toHaveBeenCalledOnce();
      expect(controller.job.getSnapshot().status).toBe('cancelled');
      expect(host.activate).not.toHaveBeenCalled();
    }
  );

  it('rejects overlapping starts and accepts a new start after cancellation settles', async () => {
    let resolve!: (job: ExecutionJob) => void;
    host.start.mockReturnValueOnce(
      new Promise<ExecutionJob>((settle) => {
        resolve = settle;
      })
    );
    const signal = new AbortController();
    const pending = startProjectTests(snapshot, request, {
      provider: 'remote',
      accessToken: 'session',
      signal: signal.signal,
    });
    await expect(startProjectTests(snapshot, request)).rejects.toThrow(
      'startup or Job must finish'
    );
    signal.abort();
    const rejection = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    resolve(createJob().controller.job);
    await rejection;
    const next = createJob().controller;
    host.start.mockResolvedValueOnce(next.job);
    await expect(startProjectTests(snapshot, request)).resolves.toBe(next.job);
    expect(host.activate).toHaveBeenCalledOnce();
    await next.job.cancel();
  });
});
