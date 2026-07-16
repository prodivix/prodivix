import { createBrowserProjectRunner } from '@prodivix/runtime-browser';
import type {
  ExecutableProjectSnapshot,
  ExecutionJob,
  ExecutionRequest,
} from '@prodivix/runtime-core';
import type {
  DataOperation,
  DataOperationInvocation,
  DataSourceDefinition,
} from '@prodivix/data';
import {
  browserProjectRuntimeHost,
  createBrowserDataExecutionEnvironment,
  executionSessionCoordinator,
  createRemoteProjectExecutionEnvironment,
  resolveBrowserProjectExecutionSnapshot,
  retainBrowserProjectExecutionSnapshot,
} from '@/editor/features/execution';

export const getBlueprintProjectExecutionSessionId = (
  workspaceId: string
): string => `workspace:${workspaceId}:project-preview`;

const runner = createBrowserProjectRunner({
  runtimeHost: browserProjectRuntimeHost,
  resolveProject: (request) =>
    resolveBrowserProjectExecutionSnapshot(
      request.workspace.workspaceId,
      request.workspace.snapshotId
    ),
});
const browserDataExecutionEnvironment = createBrowserDataExecutionEnvironment({
  publishNetworkTrace: (trace) => {
    if (!runner.publishNetworkTrace(trace))
      throw new Error(
        'Browser Data operation has no active Project execution session.'
      );
  },
});

export const executeBlueprintProjectDataOperation = (input: {
  invocation: DataOperationInvocation;
  source: DataSourceDefinition;
  operation: DataOperation;
  signal: AbortSignal;
}) => browserDataExecutionEnvironment.execute(input);

let consumerCount = 0;
let pendingStop: ReturnType<typeof globalThis.setTimeout> | undefined;
let activeJob: ExecutionJob | undefined;
let activeProvider: 'browser' | 'remote' | undefined;

export type BlueprintProjectRunProvider = 'browser' | 'remote';

export const startBlueprintProject = async (
  snapshot: ExecutableProjectSnapshot,
  request: ExecutionRequest,
  options: Readonly<{
    provider: BlueprintProjectRunProvider;
    accessToken?: string | null;
  }> = { provider: 'browser' }
): Promise<ExecutionJob> => {
  let job: ExecutionJob;
  if (activeJob) {
    await stopBlueprintProject('Execution provider changed or restarted.');
  }
  if (options.provider === 'remote') {
    if (!options.accessToken)
      throw new Error('Remote Preview requires an authenticated session.');
    const environment = createRemoteProjectExecutionEnvironment({
      accessToken: options.accessToken,
      resolveSnapshot: (candidate) => {
        if (
          candidate.workspace.workspaceId !== snapshot.workspace.workspaceId ||
          candidate.workspace.snapshotId !== snapshot.workspace.snapshotId
        )
          throw new Error('Remote Preview snapshot identity is unavailable.');
        return { kind: 'upload', snapshot };
      },
    });
    job = await environment.provider.start(request);
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
  activeProvider = options.provider;
  void job.completion.finally(() => {
    if (activeJob === job) {
      activeJob = undefined;
      activeProvider = undefined;
    }
  });
  executionSessionCoordinator.activate({
    sessionId: getBlueprintProjectExecutionSessionId(
      snapshot.workspace.workspaceId
    ),
    label: 'Project Preview',
    job,
  });
  return job;
};

export const stopBlueprintProject = async (
  reason = 'Project execution stopped.'
) => {
  const job = activeJob;
  const provider = activeProvider;
  activeJob = undefined;
  activeProvider = undefined;
  if (provider === 'remote' && job) await job.cancel({ reason });
  if (provider === 'browser' || !provider) await runner.stop(reason);
};

export const acquireBlueprintProjectRunner = (): (() => void) => {
  consumerCount += 1;
  if (pendingStop !== undefined) {
    globalThis.clearTimeout(pendingStop);
    pendingStop = undefined;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    consumerCount = Math.max(0, consumerCount - 1);
    if (consumerCount) return;
    pendingStop = globalThis.setTimeout(() => {
      pendingStop = undefined;
      if (!consumerCount) {
        void stopBlueprintProject('Run mode closed.');
      }
    }, 0);
  };
};
