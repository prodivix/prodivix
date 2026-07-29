import { describe, expect, it, vi } from 'vitest';
import {
  EXECUTION_TEST_REPORT_TRACE_NAME,
  createExecutableProjectSnapshot,
  createExecutionRequest,
  type ExecutionJob,
  type ExecutionJobEvent,
} from '@prodivix/runtime-core';
import {
  createServerFunctionInvocationTrace,
  encodeServerRuntimeTestInvocationTraces,
  SERVER_RUNTIME_TEST_INVOCATION_TRACE_FILE_PATH,
  toExecutionServerFunctionBridgeSuccess,
} from '@prodivix/server-runtime';
import {
  BROWSER_PROJECT_TEST_EXECUTION_PROVIDER_ID,
  createBrowserProjectTestRunner,
} from './browserProjectTestRunner';
import {
  createBrowserProjectRuntimeHarness,
  createBrowserProjectRuntimeHostHarness,
} from './__tests__/browserProjectRuntimeHarness';

const REPORT_PATH = '.prodivix/test-report.json';

const serverFunctionTraceFile = (): string => {
  const request = {
    requestId: 'browser-test-load-principal:1',
    invocationId: 'browser-test-load-principal',
    attempt: 1,
    functionRef: { artifactId: 'code-auth', exportName: 'loadPrincipal' },
  } as const;
  return new TextDecoder().decode(
    encodeServerRuntimeTestInvocationTraces([
      createServerFunctionInvocationTrace({
        request,
        response: toExecutionServerFunctionBridgeSuccess(request.requestId, {
          kind: 'value',
          value: { credential: 'not-projected' },
        }),
        startedAt: 190,
        completedAt: 195,
      }),
    ])
  );
};

const vitestReport = (failed = false): string =>
  JSON.stringify({
    startTime: 100,
    success: !failed,
    testResults: [
      {
        name: '/home/projects/prodivix-runner/src/App.test.tsx',
        status: failed ? 'failed' : 'passed',
        assertionResults: [
          {
            title: 'renders the app',
            fullName: 'generated application renders the app',
            status: failed ? 'failed' : 'passed',
            duration: 4,
            failureMessages: failed ? ['Expected true to be false.'] : [],
          },
        ],
        failureMessages: failed ? ['Expected true to be false.'] : [],
      },
    ],
  });

const snapshot = (snapshotId: string) =>
  createExecutableProjectSnapshot({
    workspace: { workspaceId: 'workspace', snapshotId },
    target: {
      presetId: 'react-vite',
      framework: 'react',
      runtime: 'vite',
    },
    files: [
      {
        path: 'package.json',
        contents: JSON.stringify({
          scripts: { test: 'vitest run' },
          devDependencies: { vitest: '4.1.9' },
        }),
      },
      {
        path: 'src/App.test.tsx',
        contents: `export const revision = '${snapshotId}';`,
        sourceTrace: [
          {
            sourceRef: {
              kind: 'code-artifact',
              artifactId: 'artifact-app-test',
            },
            sourceSpan: {
              artifactId: 'artifact-app-test',
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 20,
            },
          },
        ],
      },
      {
        path: 'src/auth.server.ts',
        contents: 'export const loadPrincipal = () => undefined;',
        sourceTrace: [
          {
            sourceRef: {
              kind: 'code-artifact',
              artifactId: 'code-auth',
            },
          },
        ],
      },
    ],
    dependencyPlan: { manifestFilePath: 'package.json' },
    entrypoints: [{ kind: 'test', path: 'src/App.test.tsx' }],
    capabilityRequirements: {
      preview: ['filesystem'],
      build: ['filesystem', 'build'],
      test: ['filesystem', 'server-function', 'test'],
    },
    serverRuntimeMockProvision: {
      format: 'prodivix.server-runtime-test-provision.v1',
      fixtureSetId: 'browser-auth-test',
      principal: {
        providerId: 'prodivix-test-fixture',
        principalId: 'test-user',
      },
      permissions: [],
      fixtures: [],
    },
  });

const request = (snapshotId: string, timeoutMs?: number) =>
  createExecutionRequest({
    requestId: `request-${snapshotId}`,
    profile: 'test',
    runtimeZone: 'test',
    workspace: { workspaceId: 'workspace', snapshotId },
    invocation: {
      kind: 'test',
      targetRef: { kind: 'workspace', workspaceId: 'workspace' },
    },
    requiredCapabilities: [
      'artifacts',
      'diagnostics',
      'filesystem',
      'server-function',
      'source-trace',
      'test',
    ],
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });

const collectEvents = (job: ExecutionJob): ExecutionJobEvent[] => {
  const events: ExecutionJobEvent[] = [];
  job.subscribe((event) => events.push(event));
  return events;
};

const waitForStatus = (
  job: ExecutionJob,
  status: ReturnType<ExecutionJob['getSnapshot']>['status']
): Promise<void> =>
  new Promise((resolve) => {
    if (job.getSnapshot().status === status) {
      resolve();
      return;
    }
    const unsubscribe = job.subscribe((event) => {
      if (event.kind !== 'state' || event.snapshot.status !== status) return;
      unsubscribe();
      resolve();
    });
  });

describe('browser project test runner conformance', () => {
  it('publishes canonical reports and reuses installation across source revisions', async () => {
    const harness = createBrowserProjectRuntimeHarness();
    harness.queueCommand({
      exitCode: 0,
      output: '✓ src/App.test.tsx (1 test)\n',
      writeFiles: {
        [REPORT_PATH]: vitestReport(),
        [SERVER_RUNTIME_TEST_INVOCATION_TRACE_FILE_PATH]:
          serverFunctionTraceFile(),
      },
    });
    harness.queueCommand({
      exitCode: 0,
      writeFiles: { [REPORT_PATH]: vitestReport() },
    });
    const runner = createBrowserProjectTestRunner({
      createRuntime: harness.createRuntime,
      createJobId: (input) => `job-${input.requestId}`,
      createOwnerId: () => 'test-owner',
      now: () => 200,
      resolveProject: (input) => snapshot(input.workspace.snapshotId),
    });

    expect(runner.provider.descriptor).toMatchObject({
      id: BROWSER_PROJECT_TEST_EXECUTION_PROVIDER_ID,
      profiles: ['test'],
      runtimeZones: ['test'],
      invocationKinds: ['test'],
    });
    const first = await runner.provider.start(request('one'));
    const firstEvents = collectEvents(first);
    await expect(first.completion).resolves.toMatchObject({
      status: 'succeeded',
      exitCode: 0,
      output: {
        kind: 'test-report',
        status: 'passed',
        summary: { totalFiles: 1, totalCases: 1, passedCases: 1 },
      },
    });
    const second = await runner.provider.start(request('two'));
    const secondEvents = collectEvents(second);
    await expect(second.completion).resolves.toMatchObject({
      status: 'succeeded',
    });
    expect(
      secondEvents.some(
        (event) =>
          event.kind === 'trace' && event.trace.name === 'server.function'
      )
    ).toBe(false);

    expect(
      harness.commands.filter((command) => command.args?.includes('install'))
    ).toHaveLength(1);
    expect(firstEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'trace',
          trace: expect.objectContaining({
            name: EXECUTION_TEST_REPORT_TRACE_NAME,
            sourceTrace: [
              expect.objectContaining({
                sourceRef: {
                  kind: 'code-artifact',
                  artifactId: 'artifact-app-test',
                },
              }),
            ],
          }),
        }),
        expect.objectContaining({
          kind: 'trace',
          trace: expect.objectContaining({
            traceId: 'server-function-test:job-request-one',
            spanId: 'browser-test-load-principal:1:0',
            name: 'server.function',
            detail: expect.objectContaining({
              requestId: 'browser-test-load-principal:1',
              resultKind: 'value',
              redacted: true,
            }),
            sourceTrace: [
              {
                sourceRef: {
                  kind: 'code-artifact',
                  artifactId: 'code-auth',
                },
              },
            ],
          }),
        }),
        expect.objectContaining({
          kind: 'artifact',
          artifact: expect.objectContaining({
            artifactId: 'test-report:job-request-one',
            kind: 'report',
            mediaType: 'application/vnd.prodivix.test-report+json',
          }),
        }),
      ])
    );
    const reportArtifact = firstEvents.find(
      (event) => event.kind === 'artifact' && event.artifact.kind === 'report'
    );
    expect(
      reportArtifact?.kind === 'artifact'
        ? reportArtifact.artifact.uri
        : 'missing'
    ).toBeUndefined();
    expect(JSON.stringify(firstEvents)).not.toContain('not-projected');
    await runner.dispose();
  });

  it('maps failed assertions to diagnostics and authoring source trace', async () => {
    const harness = createBrowserProjectRuntimeHarness();
    harness.queueCommand({
      exitCode: 1,
      writeFiles: { [REPORT_PATH]: vitestReport(true) },
    });
    const runner = createBrowserProjectTestRunner({
      createRuntime: harness.createRuntime,
      createJobId: () => 'job-failed',
      now: () => 200,
      resolveProject: () => snapshot('failed'),
    });
    const job = await runner.provider.start(request('failed'));
    const events = collectEvents(job);

    await expect(job.completion).resolves.toMatchObject({
      status: 'failed',
      exitCode: 1,
      failure: {
        code: 'BROWSER_PROJECT_TEST_FAILED',
        sourceTrace: [
          expect.objectContaining({
            sourceRef: {
              kind: 'code-artifact',
              artifactId: 'artifact-app-test',
            },
          }),
        ],
      },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'diagnostic',
          diagnostic: expect.objectContaining({
            code: 'TST-5001',
            targetRef: {
              kind: 'code-artifact',
              artifactId: 'artifact-app-test',
            },
          }),
        }),
      ])
    );
    await runner.dispose();
  });

  it('keeps nonzero process failure distinct from assertion failure', async () => {
    const harness = createBrowserProjectRuntimeHarness();
    harness.queueCommand({
      exitCode: 2,
      writeFiles: { [REPORT_PATH]: vitestReport() },
    });
    const runner = createBrowserProjectTestRunner({
      createRuntime: harness.createRuntime,
      now: () => 200,
      resolveProject: () => snapshot('process-failed'),
    });
    const job = await runner.provider.start(request('process-failed'));
    const events = collectEvents(job);

    await expect(job.completion).resolves.toMatchObject({
      status: 'failed',
      exitCode: 2,
      failure: { code: 'BROWSER_PROJECT_TEST_PROCESS_FAILED' },
    });
    const diagnosticCodes = events.flatMap((event) =>
      event.kind === 'diagnostic' ? [event.diagnostic.code] : []
    );
    expect(diagnosticCodes).toContain('TST-5002');
    expect(diagnosticCodes).not.toContain('TST-5001');
    await runner.dispose();
  });

  it('kills only the owned test process on cancellation and timeout', async () => {
    const cancelledHarness = createBrowserProjectRuntimeHarness();
    cancelledHarness.queueCommand({ pending: true });
    const cancelledRunner = createBrowserProjectTestRunner({
      createRuntime: cancelledHarness.createRuntime,
      resolveProject: () => snapshot('cancelled'),
    });
    const cancelledJob = await cancelledRunner.provider.start(
      request('cancelled')
    );
    const cancelledEvents = collectEvents(cancelledJob);
    await waitForStatus(cancelledJob, 'running');
    await cancelledJob.cancel({ reason: 'User stopped tests.' });
    await expect(cancelledJob.completion).resolves.toMatchObject({
      status: 'cancelled',
      reason: 'User stopped tests.',
    });
    expect(cancelledHarness.processes.at(-1)?.killed()).toBe(true);
    expect(
      cancelledEvents.some(
        (event) =>
          (event.kind === 'trace' && event.trace.name === 'test.report') ||
          (event.kind === 'artifact' && event.artifact.kind === 'report')
      )
    ).toBe(false);
    await cancelledRunner.dispose();

    const timeoutHarness = createBrowserProjectRuntimeHarness();
    timeoutHarness.queueCommand({ pending: true });
    const timeoutRunner = createBrowserProjectTestRunner({
      createRuntime: timeoutHarness.createRuntime,
      resolveProject: () => snapshot('timeout'),
    });
    const timedOutJob = await timeoutRunner.provider.start(
      request('timeout', 5)
    );
    const timedOutEvents = collectEvents(timedOutJob);
    await expect(timedOutJob.completion).resolves.toMatchObject({
      status: 'timed-out',
      timeoutMs: 5,
    });
    expect(timeoutHarness.processes.at(-1)?.killed()).toBe(true);
    expect(
      timedOutEvents.some(
        (event) =>
          (event.kind === 'trace' && event.trace.name === 'test.report') ||
          (event.kind === 'artifact' && event.artifact.kind === 'report')
      )
    ).toBe(false);
    await timeoutRunner.dispose();
  });

  it('does not publish cancellation terminal before bounded process cleanup', async () => {
    let releaseStop: () => void = () => undefined;
    const stopGate = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    const harness = createBrowserProjectRuntimeHostHarness({
      beforeStop: () => stopGate,
    });
    const runner = createBrowserProjectTestRunner({
      runtimeHost: harness.host,
      resolveProject: () => snapshot('cleanup-before-terminal'),
    });
    const job = await runner.provider.start(request('cleanup-before-terminal'));
    await waitForStatus(job, 'running');
    await vi.waitFor(() => expect(harness.processes).toHaveLength(1));

    await job.cancel({ reason: 'Wait for process cleanup.' });
    await waitForStatus(job, 'cancelling');
    let completed = false;
    void job.completion.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(harness.processes[0]?.killed()).toBe(false);

    releaseStop();
    await expect(job.completion).resolves.toMatchObject({
      status: 'cancelled',
      reason: 'Wait for process cleanup.',
    });
    expect(harness.processes[0]?.killed()).toBe(true);
    await runner.dispose();
  });

  it('rejects delayed output and runtime failure from an older process generation', async () => {
    const harness = createBrowserProjectRuntimeHostHarness();
    const runner = createBrowserProjectTestRunner({
      runtimeHost: harness.host,
      createOwnerId: () => 'test-owner',
      resolveProject: (input) => snapshot(input.workspace.snapshotId),
    });

    const first = await runner.provider.start(request('generation-one'));
    await waitForStatus(first, 'running');
    await vi.waitFor(() => expect(harness.processes).toHaveLength(1));
    const firstProcess = harness.processes[0]!;
    await first.cancel({ reason: 'Superseded test attempt.' });
    await expect(first.completion).resolves.toMatchObject({
      status: 'cancelled',
    });

    const second = await runner.provider.start(request('generation-two'));
    const events = collectEvents(second);
    await waitForStatus(second, 'running');
    await vi.waitFor(() => expect(harness.processes).toHaveLength(2));
    const secondProcess = harness.processes[1]!;
    harness.emit({
      kind: 'output',
      ownerId: firstProcess.ownerId,
      generation: firstProcess.generation,
      processId: firstProcess.processId,
      label: 'test',
      message: 'late old test output',
    });
    harness.emit({
      kind: 'runtime-error',
      ownerId: firstProcess.ownerId,
      generation: firstProcess.generation,
      processId: firstProcess.processId,
      error: new Error('late old test failure'),
    });
    harness.emit({
      kind: 'output',
      ownerId: secondProcess.ownerId,
      generation: secondProcess.generation,
      processId: secondProcess.processId,
      label: 'test',
      message: 'current test output',
    });

    expect(second.getSnapshot().status).toBe('running');
    const messages = events.flatMap((event) =>
      event.kind === 'log' ? [event.log.message] : []
    );
    expect(messages).toContain('[test] current test output');
    expect(JSON.stringify(messages)).not.toContain('late old test');
    await second.cancel();
    await second.completion;
    await runner.dispose();
  });

  it('fails closed when asynchronous timeout cleanup rejects', async () => {
    let stopAttempts = 0;
    const harness = createBrowserProjectRuntimeHostHarness({
      beforeStop: () => {
        stopAttempts += 1;
        if (stopAttempts === 1) {
          throw new Error('runtime stop transport failed');
        }
      },
    });
    const runner = createBrowserProjectTestRunner({
      runtimeHost: harness.host,
      resolveProject: () => snapshot('timeout-cleanup-reject'),
    });
    const job = await runner.provider.start(
      request('timeout-cleanup-reject', 10)
    );
    await waitForStatus(job, 'running');
    await vi.waitFor(() => expect(harness.processes).toHaveLength(1));

    await expect(job.completion).resolves.toMatchObject({
      status: 'failed',
      failure: {
        code: 'BROWSER_PROJECT_CLEANUP_FAILED',
        retryable: true,
      },
    });
    expect(stopAttempts).toBe(1);
    await runner.dispose();
    expect(harness.processes[0]?.killed()).toBe(true);
  });
});
