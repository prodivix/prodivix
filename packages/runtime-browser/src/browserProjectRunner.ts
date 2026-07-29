import {
  assertExecutableProjectCapabilitySupport,
  createExecutionJobController,
  createExecutionProviderDescriptor,
  EXECUTION_NETWORK_TRACE_NAME,
  getExecutionProviderCompatibility,
  isExecutionJobTerminalStatus,
  toExecutionNetworkTraceValue,
  type ExecutionJob,
  type ExecutionJobController,
  type ExecutionProvider,
  type ExecutionRequest,
  type ExecutionNetworkTrace,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import type {
  BrowserProjectRuntimeFactory,
  WebContainerRuntimeOptions,
} from './browserProjectRuntime';
import {
  createBrowserProjectRuntimeHost,
  type BrowserProjectRuntimeHost,
  type BrowserProjectRuntimeHostLease,
  type BrowserProjectRuntimeHostProcess,
} from './browserProjectRuntimeHost';

export const WEB_CONTAINER_EXECUTION_PROVIDER_ID =
  'prodivix.browser.web-container';

export type ResolveExecutableProjectSnapshot = (
  request: ExecutionRequest
) => ExecutableProjectSnapshot | Promise<ExecutableProjectSnapshot>;

export type BrowserProjectRunnerOptions = Readonly<{
  resolveProject: ResolveExecutableProjectSnapshot;
  runtimeHost?: BrowserProjectRuntimeHost;
  createRuntime?: BrowserProjectRuntimeFactory;
  webContainer?: WebContainerRuntimeOptions;
  createJobId?: (request: ExecutionRequest) => string;
  createOwnerId?: () => string;
  now?: () => number;
}>;

export type BrowserProjectRunner = Readonly<{
  provider: ExecutionProvider;
  publishNetworkTrace(trace: ExecutionNetworkTrace): boolean;
  stop(reason?: string): Promise<void>;
  dispose(): Promise<void>;
}>;

const providerDescriptor = createExecutionProviderDescriptor({
  id: WEB_CONTAINER_EXECUTION_PROVIDER_ID,
  version: '1',
  displayName: 'Browser Project Runner',
  isolation: 'sandboxed',
  profiles: ['preview'],
  runtimeZones: ['client'],
  invocationKinds: ['workspace', 'route'],
  capabilities: [
    'artifacts',
    'cancellation',
    'console',
    'dependency-install',
    'filesystem',
    'hmr',
    'network',
    'source-trace',
    'streaming-logs',
    'timeout',
  ],
});

const createRandomId = (prefix: string): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

const createJobId = (): string => createRandomId('browser-run');

const isJobActive = (controller: ExecutionJobController): boolean =>
  !isExecutionJobTerminalStatus(controller.job.getSnapshot().status);

const isJobRunnable = (controller: ExecutionJobController): boolean =>
  isJobActive(controller) &&
  controller.job.getSnapshot().status !== 'cancelling';

const failureMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Projects the shared browser project host as a long-lived Preview provider.
 * The runner owns preview Job/session semantics; filesystem and process reuse
 * remain in BrowserProjectRuntimeHost for Test and future host surfaces.
 */
export const createBrowserProjectRunner = (
  options: BrowserProjectRunnerOptions
): BrowserProjectRunner => {
  if (
    options.runtimeHost &&
    (options.createRuntime || options.webContainer !== undefined)
  ) {
    throw new TypeError(
      'Browser project runner cannot combine runtimeHost with runtime factory options.'
    );
  }
  const ownsRuntimeHost = !options.runtimeHost;
  const runtimeHost =
    options.runtimeHost ??
    createBrowserProjectRuntimeHost({
      ...(options.createRuntime
        ? { createRuntime: options.createRuntime }
        : {}),
      ...(options.webContainer ? { webContainer: options.webContainer } : {}),
    });
  const ownerId = (
    options.createOwnerId ?? (() => createRandomId('preview'))
  )();
  let disposed = false;
  let serverProcess: BrowserProjectRuntimeHostProcess | undefined;
  const readyUrlByProcessId = new Map<string, string>();
  let activeController: ExecutionJobController | undefined;
  let activeGeneration: number | undefined;
  let executionTail: Promise<void> = Promise.resolve();
  const serverReadyWaiters = new Map<string, Set<(url: string) => void>>();

  const emitLog = (
    controller: ExecutionJobController,
    message: string,
    stream: 'stdout' | 'stderr' | 'console' = 'stdout',
    level: 'info' | 'warning' | 'error' = 'info'
  ): void => {
    if (!isJobActive(controller)) return;
    controller.emitLog({
      stream,
      level,
      category: stream === 'console' ? 'runtime' : 'process',
      message,
    });
  };

  const unsubscribeHost = runtimeHost.subscribe((event) => {
    if (event.ownerId !== ownerId) return;
    if (event.kind === 'server-ready') {
      readyUrlByProcessId.set(event.processId, event.url);
      const waiters = serverReadyWaiters.get(event.processId);
      waiters?.forEach((resolve) => resolve(event.url));
      serverReadyWaiters.delete(event.processId);
      return;
    }
    const controller = activeController;
    if (
      !controller ||
      !isJobActive(controller) ||
      activeGeneration !== event.generation ||
      (serverProcess !== undefined &&
        serverProcess.processId !== event.processId)
    )
      return;
    if (event.kind === 'output') {
      emitLog(controller, `[${event.label}] ${event.message}`);
      return;
    }
    if (event.kind === 'output-error') {
      emitLog(
        controller,
        `[${event.label}] Output stream failed: ${event.error.message}`,
        'stderr',
        'warning'
      );
      return;
    }
    if (event.kind === 'preview-error') {
      controller.emitLog({
        stream: 'console',
        level: 'error',
        category: 'runtime',
        message: event.error.message,
        data: {
          ...(event.error.pathname ? { pathname: event.error.pathname } : {}),
          ...(event.error.stack ? { stack: event.error.stack } : {}),
        },
      });
      return;
    }
    if (event.kind === 'runtime-error' && isJobRunnable(controller)) {
      controller.fail({
        code: 'BROWSER_PROJECT_RUNTIME_FAILED',
        message: event.error.message,
        retryable: true,
      });
    }
  });

  const waitForServerReady = (
    processId: string
  ): Readonly<{
    promise: Promise<string>;
    cancel(): void;
  }> => {
    const readyUrl = readyUrlByProcessId.get(processId);
    if (readyUrl) {
      return Object.freeze({
        promise: Promise.resolve(readyUrl),
        cancel: () => undefined,
      });
    }
    let resolvePromise: (url: string) => void = () => undefined;
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });
    const listener = (url: string) => resolvePromise(url);
    const waiters = serverReadyWaiters.get(processId) ?? new Set();
    waiters.add(listener);
    serverReadyWaiters.set(processId, waiters);
    return Object.freeze({
      promise,
      cancel: () => {
        waiters.delete(listener);
        if (!waiters.size) serverReadyWaiters.delete(processId);
      },
    });
  };

  const startServer = async (
    snapshot: ExecutableProjectSnapshot,
    controller: ExecutionJobController,
    lease: BrowserProjectRuntimeHostLease
  ): Promise<string> => {
    emitLog(controller, 'Starting the isolated project server.');
    activeGeneration = lease.generation;
    const process = await runtimeHost.spawn(ownerId, snapshot.previewCommand, {
      lease,
      label: 'dev',
      kind: 'server',
    });
    serverProcess = process;
    const ready = waitForServerReady(process.processId);
    void process.exit.then((exitCode) => {
      readyUrlByProcessId.delete(process.processId);
      serverReadyWaiters.delete(process.processId);
      if (serverProcess === process) {
        serverProcess = undefined;
      }
      if (
        !process.wasStopRequested() &&
        activeController === controller &&
        isJobActive(controller)
      ) {
        controller.fail(
          {
            code: 'BROWSER_PROJECT_SERVER_EXITED',
            message: `Project server exited with code ${exitCode}.`,
            retryable: true,
          },
          { exitCode }
        );
      }
    });
    const result = await Promise.race([
      ready.promise.then((url) => ({ kind: 'ready' as const, url })),
      process.exit.then((exitCode) => ({ kind: 'exit' as const, exitCode })),
    ]);
    ready.cancel();
    if (result.kind === 'exit') {
      throw new Error(`Project server exited with code ${result.exitCode}.`);
    }
    return result.url;
  };

  const publishPreview = (
    controller: ExecutionJobController,
    request: ExecutionRequest,
    url: string
  ): void => {
    if (!isJobRunnable(controller)) return;
    controller.markRunning();
    controller.emitArtifact({
      artifactId: `preview:${controller.job.id}`,
      kind: 'custom',
      label: 'Project preview',
      mediaType: 'text/html',
      uri: url,
      metadata: {
        workspaceId: request.workspace.workspaceId,
        snapshotId: request.workspace.snapshotId,
      },
    });
    emitLog(controller, `Project preview ready at ${url}.`);
  };

  const execute = async (
    request: ExecutionRequest,
    controller: ExecutionJobController
  ): Promise<void> => {
    if (!isJobRunnable(controller)) return;
    if (
      activeController &&
      activeController !== controller &&
      isJobActive(activeController)
    ) {
      activeController.finishCancelled(
        'Superseded by a newer project snapshot.'
      );
    }
    activeController = controller;
    activeGeneration = undefined;
    controller.markStarting();
    try {
      const resolved = await options.resolveProject(request);
      if (!isJobRunnable(controller)) return;
      const snapshot = resolved;
      assertExecutableProjectCapabilitySupport(
        snapshot,
        'preview',
        providerDescriptor.capabilities
      );
      if (
        snapshot.workspace.workspaceId !== request.workspace.workspaceId ||
        snapshot.workspace.snapshotId !== request.workspace.snapshotId
      ) {
        throw new Error(
          'Resolved executable project identity does not match the execution request.'
        );
      }
      emitLog(controller, 'Preparing the executable project snapshot.');
      const preparation = await runtimeHost.prepare(
        ownerId,
        snapshot,
        'preview'
      );
      if (!isJobRunnable(controller)) return;
      if (preparation.dependenciesInstalled) {
        emitLog(controller, 'Project dependencies are ready.');
      }
      if (serverProcess?.wasStopRequested()) {
        readyUrlByProcessId.delete(serverProcess.processId);
        serverProcess = undefined;
      }
      const reusableUrl = serverProcess
        ? readyUrlByProcessId.get(serverProcess.processId)
        : undefined;
      if (serverProcess && reusableUrl) {
        activeGeneration = serverProcess.generation;
      }
      const url =
        serverProcess && reusableUrl
          ? reusableUrl
          : await startServer(snapshot, controller, preparation.lease);
      publishPreview(controller, request, url);
    } catch (error) {
      if (!isJobRunnable(controller)) return;
      controller.fail({
        code: 'BROWSER_PROJECT_START_FAILED',
        message: failureMessage(error),
        retryable: true,
      });
    }
  };

  const stopController = async (
    controller: ExecutionJobController,
    reason: string
  ): Promise<void> => {
    if (activeController === controller) {
      try {
        await runtimeHost.stopOwner(ownerId);
      } catch {
        if (isJobActive(controller)) {
          controller.fail({
            code: 'BROWSER_PROJECT_CLEANUP_FAILED',
            message:
              'Browser project runtime cleanup failed before cancellation.',
            retryable: true,
          });
        }
        return;
      }
      if (serverProcess) readyUrlByProcessId.delete(serverProcess.processId);
      serverProcess = undefined;
      activeController = undefined;
      activeGeneration = undefined;
    }
    if (isJobActive(controller)) controller.finishCancelled(reason);
  };

  const timeoutController = async (
    controller: ExecutionJobController,
    timeoutMs: number
  ): Promise<void> => {
    if (!isJobActive(controller)) return;
    if (controller.job.getSnapshot().status !== 'cancelling') {
      controller.markCancelling('Project execution timed out.');
    }
    if (activeController === controller) {
      try {
        await runtimeHost.stopOwner(ownerId);
      } catch {
        if (isJobActive(controller)) {
          controller.fail({
            code: 'BROWSER_PROJECT_CLEANUP_FAILED',
            message: 'Browser project runtime cleanup failed after timeout.',
            retryable: true,
          });
        }
        return;
      }
      if (serverProcess) readyUrlByProcessId.delete(serverProcess.processId);
      serverProcess = undefined;
      activeController = undefined;
      activeGeneration = undefined;
    }
    if (isJobActive(controller)) controller.finishTimedOut(timeoutMs);
  };

  const provider: ExecutionProvider = Object.freeze({
    descriptor: providerDescriptor,
    start: async (request): Promise<ExecutionJob> => {
      if (disposed) {
        throw new Error('The browser project runner has been disposed.');
      }
      const compatibility = getExecutionProviderCompatibility(
        providerDescriptor,
        request
      );
      if (!compatibility.compatible) {
        throw new Error(
          'The browser project runner cannot satisfy this request.'
        );
      }
      const controller: ExecutionJobController = createExecutionJobController({
        jobId: (options.createJobId ?? createJobId)(request),
        request,
        provider: providerDescriptor,
        ...(options.now ? { now: options.now } : {}),
        requestCancellation: ({ reason }) => {
          globalThis.setTimeout(() => {
            void stopController(
              controller,
              reason ?? 'Project execution was cancelled.'
            );
          }, 0);
          return 'accepted';
        },
      });
      if (request.timeoutMs !== undefined) {
        const timeout = globalThis.setTimeout(() => {
          void timeoutController(controller, request.timeoutMs!);
        }, request.timeoutMs);
        void controller.job.completion.finally(() =>
          globalThis.clearTimeout(timeout)
        );
      }
      executionTail = executionTail
        .then(() => execute(request, controller))
        .catch(() => undefined);
      return controller.job;
    },
  });

  const stop = async (reason = 'Project runner stopped.'): Promise<void> => {
    const controller = activeController;
    if (controller) await stopController(controller, reason);
    else await runtimeHost.stopOwner(ownerId);
    if (serverProcess) readyUrlByProcessId.delete(serverProcess.processId);
    serverProcess = undefined;
    activeGeneration = undefined;
    await executionTail;
  };

  return Object.freeze({
    provider,
    publishNetworkTrace(trace) {
      const controller = activeController;
      if (!controller || !isJobRunnable(controller)) return false;
      controller.emitTrace({
        traceId: `network:${controller.job.id}`,
        spanId: trace.requestId,
        name: EXECUTION_NETWORK_TRACE_NAME,
        phase: 'event',
        detail: toExecutionNetworkTraceValue(trace),
        ...(trace.sourceTrace ? { sourceTrace: trace.sourceTrace } : {}),
      });
      return true;
    },
    stop,
    dispose: async () => {
      if (disposed) return;
      await stop('Project runner disposed.');
      disposed = true;
      unsubscribeHost();
      if (ownsRuntimeHost) await runtimeHost.dispose();
    },
  });
};
