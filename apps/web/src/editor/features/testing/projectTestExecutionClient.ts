import { createBrowserProjectTestRunner } from '@prodivix/runtime-browser';
import type {
  ExecutableProjectSnapshot,
  ExecutionJob,
  ExecutionRequest,
  ExecutionWorkspaceSnapshotRef,
} from '@prodivix/runtime-core';
import { isExecutionJobTerminalStatus } from '@prodivix/runtime-core';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  browserProjectRuntimeHost,
  createRemoteProjectExecutionEnvironment,
  executionSessionCoordinator,
  resolveBrowserProjectExecutionSnapshot,
  retainBrowserProjectExecutionSnapshot,
} from '@/editor/features/execution';

export const getProjectTestExecutionSessionId = (workspaceId: string): string =>
  `workspace:${workspaceId}:project-tests`;

const runner = createBrowserProjectTestRunner({
  runtimeHost: browserProjectRuntimeHost,
  resolveProject: (request) =>
    resolveBrowserProjectExecutionSnapshot(
      request.workspace.workspaceId,
      request.workspace.snapshotId
    ),
});

export type ProjectTestExecutionProvider = 'browser' | 'remote';

/**
 * Remote Test may only execute the exact Workspace revision that the local plan
 * compiled: same identity, same mock-only policy, same partition revisions.
 *
 * The two `partitionRevisions` records reach this guard from different
 * normalizers — `createExecutionRequest` orders keys with the host locale while
 * `ExecutableProjectSnapshot` orders them by code point — so identity is compared
 * canonically. Comparing serialized text would reject a legitimate run whenever
 * the two collations disagree on a document id.
 */
export const isRemoteProjectTestRequestAligned = (
  request: ExecutionRequest,
  workspace: ExecutionWorkspaceSnapshotRef
): boolean =>
  request.profile === 'test' &&
  request.runtimeZone === 'test' &&
  request.environment === undefined &&
  request.workspace.workspaceId === workspace.workspaceId &&
  request.workspace.snapshotId === workspace.snapshotId &&
  sameCanonicalJson(
    request.workspace.partitionRevisions ?? {},
    workspace.partitionRevisions ?? {}
  );

let activeJob: ExecutionJob | undefined;
let pendingStartup: AbortController | undefined;

export const startProjectTests = async (
  snapshot: ExecutableProjectSnapshot,
  request: ExecutionRequest,
  options: Readonly<{
    provider?: ProjectTestExecutionProvider;
    accessToken?: string | null;
    signal?: AbortSignal;
  }> = {}
): Promise<ExecutionJob> => {
  if (
    pendingStartup ||
    (activeJob && !isExecutionJobTerminalStatus(activeJob.getSnapshot().status))
  )
    throw new Error(
      'The previous Workspace Test startup or Job must finish before another provider starts.'
    );
  if (options.signal?.aborted)
    throw new DOMException(
      'Workspace Test startup was cancelled.',
      'AbortError'
    );
  const startup = new AbortController();
  pendingStartup = startup;
  try {
    const provider = options.provider ?? 'browser';
    let job: ExecutionJob;
    if (provider === 'remote') {
      if (!options.accessToken?.trim())
        throw new Error('Remote Test requires an authenticated session.');
      const environment = createRemoteProjectExecutionEnvironment({
        accessToken: options.accessToken,
        resolveSnapshot: (candidate) => {
          if (!isRemoteProjectTestRequestAligned(candidate, snapshot.workspace))
            throw new Error(
              'Remote Test snapshot identity or mock-only policy drifted.'
            );
          return { kind: 'upload', snapshot };
        },
      });
      job = await environment.testProvider.start(request);
    } else {
      const releaseSnapshot = retainBrowserProjectExecutionSnapshot(snapshot);
      try {
        job = await runner.provider.start(request);
      } catch (error) {
        releaseSnapshot();
        throw error;
      }
      void job.completion.finally(releaseSnapshot);
    }
    activeJob = job;
    void job.completion.finally(() => {
      if (activeJob === job) activeJob = undefined;
    });
    if (startup.signal.aborted || options.signal?.aborted) {
      await job.cancel({ reason: 'Workspace Test startup was cancelled.' });
      throw new DOMException(
        'Workspace Test startup was cancelled.',
        'AbortError'
      );
    }
    executionSessionCoordinator.activate({
      sessionId: getProjectTestExecutionSessionId(
        snapshot.workspace.workspaceId
      ),
      label: 'Workspace Tests',
      job,
    });
    return job;
  } finally {
    if (pendingStartup === startup) pendingStartup = undefined;
  }
};

export const stopProjectTests = (
  reason = 'Workspace test execution stopped.'
): Promise<void> => {
  pendingStartup?.abort();
  const job = activeJob;
  if (!job) return runner.stop(reason);
  return job.cancel({ reason }).then(() => undefined);
};
