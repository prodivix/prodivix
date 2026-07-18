import { createBrowserProjectRunner } from '@prodivix/runtime-browser';
import type {
  ExecutableProjectSnapshot,
  ExecutionDataGatewayBridgeRequest,
  ExecutionDataGatewayBridgeResponse,
  ExecutionCancellationResult,
  ExecutionJob,
  ExecutionLogRecord,
  ExecutionNetworkTrace,
  ExecutionRequest,
} from '@prodivix/runtime-core';
import type {
  DataOperationInvocation,
  DataLifecycleChannel,
  DataSourceDocument,
} from '@prodivix/data';
import type { RemoteExecutionTerminalClient } from '@prodivix/runtime-remote';
import {
  browserProjectRuntimeHost,
  createBrowserDataExecutionEnvironment,
  createRemoteDataGatewayRunCoordinator,
  createRemoteServerFunctionRunCoordinator,
  executionSessionCoordinator,
  createRemoteProjectExecutionEnvironment,
  resolveBrowserProjectExecutionSnapshot,
  retainBrowserProjectExecutionSnapshot,
} from '@/editor/features/execution';
import type {
  ExecutionServerFunctionBridgeCancellation,
  ExecutionServerFunctionBridgeRequest,
  ExecutionServerFunctionBridgeResponse,
} from '@prodivix/server-runtime';

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
  document: DataSourceDocument;
  lifecycleChannel: DataLifecycleChannel;
  signal: AbortSignal;
}) => browserDataExecutionEnvironment.execute(input);

let consumerCount = 0;
let pendingStop: ReturnType<typeof globalThis.setTimeout> | undefined;
let activeJob: ExecutionJob | undefined;
let activeProvider: 'browser' | 'remote' | undefined;
let activeTerminalClient: RemoteExecutionTerminalClient | undefined;
let activeArtifactResolver:
  | ReturnType<typeof createRemoteProjectExecutionEnvironment>['artifacts']
  | undefined;
const cancellationTerminalWaitMs = 15_000;
const remoteDataGatewayRuns = createRemoteDataGatewayRunCoordinator({
  publishTrace: (input) => executionSessionCoordinator.publishTrace(input),
});
const remoteServerFunctionRuns = createRemoteServerFunctionRunCoordinator({
  publishTrace: (input) => executionSessionCoordinator.publishTrace(input),
});

export type BlueprintProjectRunProvider = 'browser' | 'remote';

export const getBlueprintProjectTerminalClient = () => activeTerminalClient;
export const getBlueprintProjectArtifactResolver = () => activeArtifactResolver;

export class BlueprintProjectCancellationPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlueprintProjectCancellationPendingError';
  }
}

/** Executes a strict value-only iframe request through the active authenticated Remote execution authority. */
export const executeBlueprintProjectRemoteDataBridge = async (
  request: ExecutionDataGatewayBridgeRequest
): Promise<ExecutionDataGatewayBridgeResponse> =>
  remoteDataGatewayRuns.execute(request);

export const executeBlueprintProjectRemoteServerFunctionBridge = async (
  request: ExecutionServerFunctionBridgeRequest
): Promise<ExecutionServerFunctionBridgeResponse> =>
  remoteServerFunctionRuns.execute(request);

export const cancelBlueprintProjectRemoteServerFunctionBridge = (
  cancellation: ExecutionServerFunctionBridgeCancellation
): boolean => remoteServerFunctionRuns.cancel(cancellation);

/** Publishes sanitized traces emitted by the active local preview iframe into the same Execution Job. */
export const publishBlueprintProjectNetworkTrace = (
  trace: ExecutionNetworkTrace
): boolean =>
  activeProvider === 'browser' ? runner.publishNetworkTrace(trace) : false;

/** Publishes an exact-frame application Console record into the active Session generation. */
export const publishBlueprintProjectConsoleLog = (input: {
  observationId: string;
  log: ExecutionLogRecord;
}): boolean => {
  const job = activeJob;
  if (!job) return false;
  const sessionId = getBlueprintProjectExecutionSessionId(
    job.request.workspace.workspaceId
  );
  const publication = executionSessionCoordinator.publishConsole({
    sessionId,
    jobId: job.id,
    observationId: input.observationId,
    log: {
      ...input.log,
      sourceTrace:
        input.log.sourceTrace ??
        Object.freeze([
          Object.freeze({
            sourceRef: job.request.invocation.targetRef,
            label: 'Generated application console',
          }),
        ]),
    },
  });
  return (
    publication.status === 'published' || publication.status === 'duplicate'
  );
};

export const startBlueprintProject = async (
  snapshot: ExecutableProjectSnapshot,
  request: ExecutionRequest,
  options: Readonly<{
    provider: BlueprintProjectRunProvider;
    accessToken?: string | null;
  }> = { provider: 'browser' }
): Promise<ExecutionJob> => {
  let job: ExecutionJob;
  let remoteDataGatewayInvoke:
    | ReturnType<
        typeof createRemoteProjectExecutionEnvironment
      >['dataGateway']['invoke']
    | undefined;
  let remoteServerFunctionInvoke:
    | ReturnType<
        typeof createRemoteProjectExecutionEnvironment
      >['serverFunctions']['invoke']
    | undefined;
  if (activeJob) {
    await stopBlueprintProject('Execution provider changed or restarted.', {
      waitForTerminal: true,
    });
    if (activeJob)
      throw new BlueprintProjectCancellationPendingError(
        'The previous execution did not reach a terminal state; a new request was not created.'
      );
  }
  remoteDataGatewayRuns.deactivate();
  remoteServerFunctionRuns.deactivate();
  activeTerminalClient = undefined;
  activeArtifactResolver = undefined;
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
    remoteDataGatewayInvoke = environment.dataGateway.invoke;
    remoteServerFunctionInvoke = environment.serverFunctions.invoke;
    activeTerminalClient = environment.terminal;
    activeArtifactResolver = environment.artifacts;
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
  const sessionId = getBlueprintProjectExecutionSessionId(
    snapshot.workspace.workspaceId
  );
  executionSessionCoordinator.activate({
    sessionId,
    label: 'Project Preview',
    job,
  });
  if (remoteDataGatewayInvoke)
    remoteDataGatewayRuns.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId,
      invoke: remoteDataGatewayInvoke,
    });
  if (remoteServerFunctionInvoke)
    remoteServerFunctionRuns.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId,
      invoke: remoteServerFunctionInvoke,
    });
  void job.completion.then((result) => {
    if (activeJob !== job) return;
    activeTerminalClient = undefined;
    if (
      options.provider === 'remote' &&
      result.status === 'succeeded' &&
      remoteDataGatewayRuns.hasActiveJob(job.id)
    )
      return;
    remoteDataGatewayRuns.deactivate(job.id);
    remoteServerFunctionRuns.deactivate(job.id);
    activeJob = undefined;
    activeProvider = undefined;
  });
  return job;
};

export const stopBlueprintProject = async (
  reason = 'Project execution stopped.',
  options: Readonly<{ waitForTerminal?: boolean }> = {}
): Promise<ExecutionCancellationResult | undefined> => {
  remoteDataGatewayRuns.deactivate();
  remoteServerFunctionRuns.deactivate();
  const job = activeJob;
  if (!job) {
    activeProvider = undefined;
    activeTerminalClient = undefined;
    activeArtifactResolver = undefined;
    await runner.stop(reason);
    return undefined;
  }
  const cancellation = await job.cancel({ reason });
  if (
    options.waitForTerminal &&
    (cancellation.status === 'accepted' ||
      cancellation.status === 'already-requested')
  ) {
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    try {
      await Promise.race([
        job.completion,
        new Promise<never>((_resolve, reject) => {
          timeout = globalThis.setTimeout(
            () =>
              reject(
                new BlueprintProjectCancellationPendingError(
                  'Execution cancellation did not reach a terminal state within its recovery budget.'
                )
              ),
            cancellationTerminalWaitMs
          );
        }),
      ]);
    } finally {
      if (timeout !== undefined) globalThis.clearTimeout(timeout);
    }
  }
  if (
    options.waitForTerminal &&
    (cancellation.status === 'already-terminal' ||
      ['succeeded', 'failed', 'cancelled', 'timed-out'].includes(
        job.getSnapshot().status
      )) &&
    activeJob === job
  ) {
    activeJob = undefined;
    activeProvider = undefined;
    activeTerminalClient = undefined;
    activeArtifactResolver = undefined;
  }
  return cancellation;
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
