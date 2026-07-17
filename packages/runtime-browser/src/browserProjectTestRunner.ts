import {
  EXECUTION_TEST_REPORT_TRACE_NAME,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  assertExecutableProjectCapabilitySupport,
  createExecutionJobController,
  createExecutionProviderDescriptor,
  getExecutionProviderCompatibility,
  isExecutionJobTerminalStatus,
  toExecutionTestReportValue,
  type ExecutionJob,
  type ExecutionJobController,
  type ExecutionProvider,
  type ExecutionRequest,
  type ExecutionSourceTrace,
  type ExecutionTestReport,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import type {
  BrowserProjectRuntimeFactory,
  WebContainerRuntimeOptions,
} from './browserProjectRuntime';
import {
  createBrowserProjectRuntimeHost,
  type BrowserProjectRuntimeHost,
} from './browserProjectRuntimeHost';
import { parseVitestExecutionTestReport } from '@prodivix/runtime-vitest';

export const BROWSER_PROJECT_TEST_EXECUTION_PROVIDER_ID =
  'prodivix.browser.web-container.test';

export type ResolveBrowserProjectTestSnapshot = (
  request: ExecutionRequest
) => ExecutableProjectSnapshot | Promise<ExecutableProjectSnapshot>;

export type BrowserProjectTestRunnerOptions = Readonly<{
  resolveProject: ResolveBrowserProjectTestSnapshot;
  runtimeHost?: BrowserProjectRuntimeHost;
  createRuntime?: BrowserProjectRuntimeFactory;
  webContainer?: WebContainerRuntimeOptions;
  createJobId?: (request: ExecutionRequest) => string;
  createOwnerId?: () => string;
  now?: () => number;
}>;

export type BrowserProjectTestRunner = Readonly<{
  provider: ExecutionProvider;
  stop(reason?: string): Promise<void>;
  dispose(): Promise<void>;
}>;

const providerDescriptor = createExecutionProviderDescriptor({
  id: BROWSER_PROJECT_TEST_EXECUTION_PROVIDER_ID,
  version: '1',
  displayName: 'Browser Project Test Runner',
  isolation: 'sandboxed',
  profiles: ['test'],
  runtimeZones: ['test'],
  invocationKinds: ['test'],
  capabilities: [
    'artifacts',
    'cancellation',
    'dependency-install',
    'diagnostics',
    'filesystem',
    'source-trace',
    'streaming-logs',
    'test',
    'timeout',
  ],
});

const createRandomId = (prefix: string): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

const createJobId = (): string => createRandomId('browser-test');

const isJobActive = (controller: ExecutionJobController): boolean =>
  !isExecutionJobTerminalStatus(controller.job.getSnapshot().status);

const isJobRunnable = (controller: ExecutionJobController): boolean =>
  isJobActive(controller) &&
  controller.job.getSnapshot().status !== 'cancelling';

const failureMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const parentDirectories = (path: string): readonly string[] => {
  const segments = path.split('/');
  return segments
    .slice(0, -1)
    .map((_, index) => segments.slice(0, index + 1).join('/'));
};

const artifactUri = (
  request: ExecutionRequest,
  reportFilePath: string
): string =>
  `browser-project://${encodeURIComponent(
    request.workspace.workspaceId
  )}/${encodeURIComponent(request.workspace.snapshotId)}/${reportFilePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

const reportSourceTrace = (
  request: ExecutionRequest
): readonly ExecutionSourceTrace[] =>
  Object.freeze([
    Object.freeze({
      sourceRef: request.invocation.targetRef,
      label: 'Project test run',
    }),
  ]);

const resolveSnapshotFileSourceTrace = (
  snapshot: ExecutableProjectSnapshot,
  reportedPath: string,
  fallback: readonly ExecutionSourceTrace[]
): readonly ExecutionSourceTrace[] => {
  const normalized = reportedPath.replaceAll('\\', '/');
  const file = snapshot.files.find(
    (candidate) =>
      normalized === candidate.path || normalized.endsWith(`/${candidate.path}`)
  );
  return file?.sourceTrace?.length ? file.sourceTrace : fallback;
};

const collectReportSourceTrace = (
  report: ExecutionTestReport,
  fallback: readonly ExecutionSourceTrace[],
  failedOnly = false
): readonly ExecutionSourceTrace[] => {
  const traces = report.files
    .filter((file) => !failedOnly || file.status === 'failed')
    .flatMap((file) => file.sourceTrace ?? []);
  if (!traces.length) return fallback;
  const seen = new Set<string>();
  return Object.freeze(
    traces.filter((trace) => {
      const identity = JSON.stringify([
        trace.sourceRef,
        trace.sourceSpan ?? null,
        trace.label ?? null,
      ]);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
  );
};

/** Runs the canonical project Test plan as a one-shot ExecutionJob. */
export const createBrowserProjectTestRunner = (
  options: BrowserProjectTestRunnerOptions
): BrowserProjectTestRunner => {
  if (
    options.runtimeHost &&
    (options.createRuntime || options.webContainer !== undefined)
  ) {
    throw new TypeError(
      'Browser project test runner cannot combine runtimeHost with runtime factory options.'
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
  const ownerId = (options.createOwnerId ?? (() => createRandomId('test')))();
  const now = options.now ?? Date.now;
  let disposed = false;
  let activeController: ExecutionJobController | undefined;
  let executionTail: Promise<void> = Promise.resolve();

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
    if ('ownerId' in event && event.ownerId && event.ownerId !== ownerId) {
      return;
    }
    const controller = activeController;
    if (!controller || !isJobActive(controller)) return;
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
    if (event.kind === 'runtime-error' && isJobRunnable(controller)) {
      controller.fail({
        code: 'BROWSER_PROJECT_TEST_RUNTIME_FAILED',
        message: event.error.message,
        retryable: true,
      });
    }
  });

  const publishReport = (
    controller: ExecutionJobController,
    request: ExecutionRequest,
    report: ExecutionTestReport,
    reportFilePath: string
  ): void => {
    const sourceTrace = collectReportSourceTrace(
      report,
      reportSourceTrace(request)
    );
    controller.emitTrace({
      traceId: `test:${controller.job.id}`,
      spanId: `test-report:${controller.job.id}`,
      name: EXECUTION_TEST_REPORT_TRACE_NAME,
      phase: 'event',
      detail: toExecutionTestReportValue(report),
      sourceTrace,
    });
    controller.emitArtifact({
      artifactId: `test-report:${controller.job.id}`,
      kind: 'report',
      label: 'Project test report',
      mediaType: EXECUTION_TEST_REPORT_MEDIA_TYPE,
      uri: artifactUri(request, reportFilePath),
      sourceTrace,
      metadata: {
        reportId: report.reportId,
        status: report.status,
        totalFiles: String(report.summary.totalFiles),
        totalCases: String(report.summary.totalCases),
        failedFiles: String(report.summary.failedFiles),
        failedCases: String(report.summary.failedCases),
      },
    });
  };

  const publishFailedTestDiagnostic = (
    controller: ExecutionJobController,
    request: ExecutionRequest,
    report: ExecutionTestReport
  ): void => {
    const failedFiles = report.files.filter((file) => file.status === 'failed');
    (failedFiles.length ? failedFiles : [undefined]).forEach((file) => {
      const trace = file?.sourceTrace?.[0];
      const failedCases = file
        ? file.cases.filter((testCase) => testCase.status === 'failed').length
        : report.summary.failedCases;
      controller.emitDiagnostic({
        code: 'TST-5001',
        severity: 'error',
        domain: 'workspace',
        message: file
          ? `${failedCases} test case(s) failed in ${file.path}.`
          : `${report.summary.failedCases} test case(s) failed in ${report.summary.failedFiles} file(s).`,
        hint: 'Open the test report and console output to inspect the failing assertions.',
        retryable: false,
        targetRef: trace?.sourceRef ?? request.invocation.targetRef,
        ...(trace?.sourceSpan ? { sourceSpan: trace.sourceSpan } : {}),
        meta: {
          reportId: report.reportId,
          ...(file ? { path: file.path } : {}),
          failedFiles: report.summary.failedFiles,
          failedCases,
        },
      });
    });
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
      await runtimeHost.stopOwner(ownerId);
      activeController.finishCancelled(
        'Superseded by a newer project test snapshot.'
      );
    }
    activeController = controller;
    controller.markStarting();
    try {
      const resolved = await options.resolveProject(request);
      if (!isJobRunnable(controller)) return;
      const snapshot = resolved;
      assertExecutableProjectCapabilitySupport(
        snapshot,
        'test',
        providerDescriptor.capabilities
      );
      if (
        snapshot.workspace.workspaceId !== request.workspace.workspaceId ||
        snapshot.workspace.snapshotId !== request.workspace.snapshotId
      ) {
        throw new Error(
          'Resolved executable project identity does not match the test execution request.'
        );
      }
      emitLog(controller, 'Preparing the project test snapshot.');
      const preparation = await runtimeHost.prepare(ownerId, snapshot, 'test');
      if (!isJobRunnable(controller)) return;

      await runtimeHost.remove(
        snapshot.testPlan.reportFilePath,
        preparation.lease
      );
      for (const directory of parentDirectories(
        snapshot.testPlan.reportFilePath
      )) {
        await runtimeHost.mkdir(directory, preparation.lease);
      }
      if (!isJobRunnable(controller)) return;
      controller.markRunning();
      emitLog(controller, 'Running project tests.');
      const process = await runtimeHost.spawn(
        ownerId,
        snapshot.testPlan.command,
        { lease: preparation.lease, label: 'test' }
      );
      const exitCode = await process.exit;
      await process.outputCompletion;
      if (!isJobRunnable(controller)) return;

      const report = parseVitestExecutionTestReport({
        source: await runtimeHost.readFile(
          snapshot.testPlan.reportFilePath,
          preparation.lease
        ),
        reportId: `test-report:${controller.job.id}`,
        completedAt: now(),
        sourceTrace: reportSourceTrace(request),
        resolveSourceTrace: (testFilePath) =>
          resolveSnapshotFileSourceTrace(
            snapshot,
            testFilePath,
            reportSourceTrace(request)
          ),
      });
      publishReport(
        controller,
        request,
        report,
        snapshot.testPlan.reportFilePath
      );
      if (report.status === 'failed') {
        publishFailedTestDiagnostic(controller, request, report);
        controller.fail(
          {
            code: 'BROWSER_PROJECT_TEST_FAILED',
            message: 'Project tests failed.',
            retryable: false,
            details: {
              reportId: report.reportId,
              failedFiles: report.summary.failedFiles,
              failedCases: report.summary.failedCases,
            },
            sourceTrace: collectReportSourceTrace(
              report,
              reportSourceTrace(request),
              true
            ),
          },
          { exitCode }
        );
        return;
      }
      if (exitCode !== 0) {
        const message = `Project test process exited with code ${exitCode} after producing a passing report.`;
        controller.emitDiagnostic({
          code: 'TST-5002',
          severity: 'error',
          domain: 'workspace',
          message,
          hint: 'Review the test command, setup files, and runner output.',
          retryable: true,
          targetRef: request.invocation.targetRef,
          meta: { reportId: report.reportId, exitCode },
        });
        controller.fail(
          {
            code: 'BROWSER_PROJECT_TEST_PROCESS_FAILED',
            message,
            retryable: true,
            details: { reportId: report.reportId, exitCode },
            sourceTrace: collectReportSourceTrace(
              report,
              reportSourceTrace(request)
            ),
          },
          { exitCode }
        );
        return;
      }
      controller.succeed({
        output: toExecutionTestReportValue(report),
        exitCode,
      });
    } catch (error) {
      if (!isJobRunnable(controller)) return;
      const message = failureMessage(error);
      controller.emitDiagnostic({
        code: 'TST-5002',
        severity: 'error',
        domain: 'workspace',
        message,
        hint: 'Review the project test command and generated report configuration.',
        retryable: true,
        targetRef: request.invocation.targetRef,
      });
      controller.fail({
        code: 'BROWSER_PROJECT_TEST_RUN_FAILED',
        message,
        retryable: true,
        sourceTrace: reportSourceTrace(request),
      });
    } finally {
      if (activeController === controller && !isJobActive(controller)) {
        activeController = undefined;
      }
    }
  };

  const stopController = async (
    controller: ExecutionJobController,
    reason: string
  ): Promise<void> => {
    if (activeController === controller) {
      await runtimeHost.stopOwner(ownerId);
      activeController = undefined;
    }
    if (isJobActive(controller)) controller.finishCancelled(reason);
  };

  const provider: ExecutionProvider = Object.freeze({
    descriptor: providerDescriptor,
    start: async (request): Promise<ExecutionJob> => {
      if (disposed) {
        throw new Error('The browser project test runner has been disposed.');
      }
      const compatibility = getExecutionProviderCompatibility(
        providerDescriptor,
        request
      );
      if (!compatibility.compatible) {
        throw new Error(
          'The browser project test runner cannot satisfy this request.'
        );
      }
      let controller: ExecutionJobController;
      controller = createExecutionJobController({
        jobId: (options.createJobId ?? createJobId)(request),
        request,
        provider: providerDescriptor,
        ...(options.now ? { now: options.now } : {}),
        requestCancellation: ({ reason }) => {
          globalThis.setTimeout(() => {
            void stopController(
              controller,
              reason ?? 'Project test execution was cancelled.'
            );
          }, 0);
          return 'accepted';
        },
      });
      if (request.timeoutMs !== undefined) {
        const timeout = globalThis.setTimeout(() => {
          if (!isJobActive(controller)) return;
          if (activeController === controller) activeController = undefined;
          void runtimeHost.stopOwner(ownerId);
          controller.finishTimedOut(request.timeoutMs);
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

  const stop = async (
    reason = 'Project test runner stopped.'
  ): Promise<void> => {
    const controller = activeController;
    if (controller) await stopController(controller, reason);
    else await runtimeHost.stopOwner(ownerId);
    await executionTail;
  };

  return Object.freeze({
    provider,
    stop,
    dispose: async () => {
      if (disposed) return;
      await stop('Project test runner disposed.');
      disposed = true;
      unsubscribeHost();
      if (ownsRuntimeHost) await runtimeHost.dispose();
    },
  });
};
