import {
  assertExecutableProjectCapabilitySupport,
  createExecutionSecretLeakDiagnostic,
  createExecutionJobController,
  createExecutionProviderDescriptor,
  EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
  EXECUTION_FILESYSTEM_DIFF_FORMAT,
  EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE,
  EXECUTION_NETWORK_TRACE_NAME,
  EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
  EXECUTION_SECRET_LEAK_DIAGNOSTIC_CODE,
  EXECUTION_SECRET_LEAK_FAILURE_CODE,
  EXECUTION_SECRET_LEAK_REASON,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_TRACE_NAME,
  getExecutionProviderCompatibility,
  isExecutionJobTerminalStatus,
  readExecutionNetworkTraceValue,
  readExecutionTestReportValue,
  type ExecutionJobController,
  type ExecutionJobEvent,
  type ExecutionJobStatus,
  type ExecutionArtifact,
  type ExecutionProvider,
  type ExecutionProviderDescriptor,
  type ExecutionRequest,
  type ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import {
  ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
  readExecutionServerFunctionBridgeRequest,
  readServerFunctionInvocationTraceValue,
  SERVER_FUNCTION_INVOCATION_TRACE_NAME,
} from '@prodivix/server-runtime';
import {
  RemoteExecutionClientError,
  RemoteExecutionRecoveryRequiredError,
} from './remoteExecutionClient';
import {
  createRemoteExecutionRecoveryPlan,
  reconnectRemoteExecution,
} from './remoteExecutionRecovery';
import type {
  RemoteExecutionClient,
  RemoteExecutionRecord,
  RemoteExecutionSnapshotSource,
} from './remoteExecutionProtocol.types';
import { REMOTE_EXECUTION_PROTOCOL_LIMITS } from './remoteExecutionProtocol.types';

export const REMOTE_PREVIEW_EXECUTION_PROVIDER_ID = 'prodivix.remote.preview';
export const REMOTE_TEST_EXECUTION_PROVIDER_ID = 'prodivix.remote.test';
export const REMOTE_BUILD_EXECUTION_PROVIDER_ID = 'prodivix.remote.build';
export const REMOTE_SERVER_FUNCTION_EXECUTION_PROVIDER_ID =
  'prodivix.remote.server-function';

const commonCapabilities = [
  'artifacts',
  'cancellation',
  'dependency-install',
  'diagnostics',
  'filesystem',
  'network',
  'source-trace',
  'streaming-logs',
  'timeout',
] as const;

export const remotePreviewExecutionProviderDescriptor =
  createExecutionProviderDescriptor({
    id: REMOTE_PREVIEW_EXECUTION_PROVIDER_ID,
    version: '1',
    displayName: 'Remote Preview',
    isolation: 'remote-isolated',
    profiles: ['preview'],
    runtimeZones: ['client'],
    invocationKinds: ['workspace', 'route'],
    capabilities: [
      ...commonCapabilities,
      'console',
      'data-stream',
      'environment-binding',
      'server-function',
      'terminal',
    ],
  });

export const remoteTestExecutionProviderDescriptor =
  createExecutionProviderDescriptor({
    id: REMOTE_TEST_EXECUTION_PROVIDER_ID,
    version: '1',
    displayName: 'Remote Test',
    isolation: 'remote-isolated',
    profiles: ['test'],
    runtimeZones: ['test'],
    invocationKinds: ['test'],
    capabilities: [...commonCapabilities, 'server-function', 'test'],
  });

export const remoteBuildExecutionProviderDescriptor =
  createExecutionProviderDescriptor({
    id: REMOTE_BUILD_EXECUTION_PROVIDER_ID,
    version: '1',
    displayName: 'Remote Build',
    isolation: 'remote-isolated',
    profiles: ['build'],
    runtimeZones: ['build'],
    invocationKinds: ['build'],
    capabilities: [...commonCapabilities, 'build'],
  });

export const remoteServerFunctionExecutionProviderDescriptor =
  createExecutionProviderDescriptor({
    id: REMOTE_SERVER_FUNCTION_EXECUTION_PROVIDER_ID,
    version: '1',
    displayName: 'Remote Server Function',
    isolation: 'remote-isolated',
    profiles: ['production'],
    runtimeZones: ['server'],
    invocationKinds: ['code'],
    capabilities: [
      'artifacts',
      'cancellation',
      'dependency-install',
      'diagnostics',
      'filesystem',
      'server-function',
      'source-trace',
      'streaming-logs',
      'timeout',
    ],
  });

export type ResolveRemoteExecutionSnapshot = (
  request: ExecutionRequest
) => RemoteExecutionSnapshotSource | Promise<RemoteExecutionSnapshotSource>;

export type CreateRemoteExecutionProviderOptions = Readonly<{
  descriptor: ExecutionProviderDescriptor;
  client: RemoteExecutionClient;
  resolveSnapshot: ResolveRemoteExecutionSnapshot;
  pollIntervalMs?: number;
  eventPageSize?: number;
  maximumReconnectAttempts?: number;
  delay?: (milliseconds: number) => Promise<void>;
  createCancellationId?: (
    executionId: string,
    request: ExecutionRequest
  ) => string;
  materializeArtifact?: (
    input: Readonly<{
      executionId: string;
      snapshotDigest: string;
      artifact: ExecutionArtifact;
    }>
  ) => ExecutionArtifact | Promise<ExecutionArtifact>;
}>;

const defaultDelay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    const timer = (
      globalThis as unknown as {
        setTimeout(callback: () => void, delay: number): unknown;
      }
    ).setTimeout;
    timer(resolve, milliseconds);
  });

const positiveSafeInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new TypeError(`${label} must be a positive safe integer.`);
  return value;
};

const active = (controller: ExecutionJobController): boolean =>
  !isExecutionJobTerminalStatus(controller.job.getSnapshot().status);

const maximumServerFunctionSourceTraces = 128;

const hasSingleExactServerFunctionRootSource = (
  sourceTrace: readonly ExecutionSourceTrace[] | undefined,
  artifactId: string
): sourceTrace is readonly ExecutionSourceTrace[] =>
  Boolean(
    sourceTrace?.length &&
    sourceTrace.length <= maximumServerFunctionSourceTraces &&
    sourceTrace.filter(
      (trace) =>
        trace.sourceRef.kind === 'code-artifact' &&
        trace.sourceRef.artifactId === artifactId &&
        (!trace.sourceSpan || trace.sourceSpan.artifactId === artifactId)
    ).length === 1
  );

const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      return candidate;
    const record = candidate as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, record[key]])
    );
  });

const sameSourceTrace = (
  left: readonly ExecutionSourceTrace[] | undefined,
  right: readonly ExecutionSourceTrace[] | undefined
): boolean => canonicalJson(left) === canonicalJson(right);

const secretLeakDiagnosticControllers = new WeakSet<ExecutionJobController>();

const acceptedProviderMatches = (
  expected: ExecutionProviderDescriptor,
  actual: ExecutionProviderDescriptor
): boolean =>
  expected.id === actual.id &&
  expected.version === actual.version &&
  expected.displayName === actual.displayName &&
  actual.isolation === 'remote-isolated' &&
  expected.profiles.join('\0') === actual.profiles.join('\0') &&
  expected.runtimeZones.join('\0') === actual.runtimeZones.join('\0') &&
  expected.invocationKinds.join('\0') === actual.invocationKinds.join('\0') &&
  expected.capabilities.join('\0') === actual.capabilities.join('\0');

const terminal = (
  controller: ExecutionJobController,
  status: ExecutionJobStatus,
  reason?: string
): void => {
  if (!active(controller)) return;
  switch (status) {
    case 'succeeded':
      controller.succeed();
      return;
    case 'failed':
      if (reason === EXECUTION_SECRET_LEAK_REASON) {
        if (!secretLeakDiagnosticControllers.has(controller))
          controller.emitDiagnostic(createExecutionSecretLeakDiagnostic());
        controller.fail({
          code: EXECUTION_SECRET_LEAK_FAILURE_CODE,
          message:
            'Execution output was blocked because it contained protected material.',
          retryable: false,
        });
        return;
      }
      if (reason === 'worker-recovery-exhausted') {
        controller.fail({
          code: 'REMOTE_WORKER_RECOVERY_EXHAUSTED',
          message:
            'The remote execution exhausted its bounded worker recovery attempts.',
          retryable: true,
        });
        return;
      }
      if (
        reason === 'network-policy-denied' ||
        reason === 'runtime-network-isolation-failed'
      ) {
        controller.fail({
          code: 'REMOTE_NETWORK_POLICY_DENIED',
          message:
            'Remote execution was blocked by the configured network policy.',
          retryable: false,
        });
        return;
      }
      if (reason === 'secret-resolution-denied') {
        controller.fail({
          code: 'REMOTE_PERMISSION_DENIED',
          message:
            'Remote execution could not resolve an authorized runtime binding.',
          retryable: false,
        });
        return;
      }
      controller.fail({
        code: 'REMOTE_EXECUTION_FAILED',
        message: reason ?? 'Remote execution failed.',
        retryable: false,
      });
      return;
    case 'cancelled':
      controller.finishCancelled(reason);
      return;
    case 'timed-out':
      controller.finishTimedOut(controller.job.request.timeoutMs);
      return;
    default:
      return;
  }
};

const applyState = (
  controller: ExecutionJobController,
  status: ExecutionJobStatus,
  reason?: string
): void => {
  const current = controller.job.getSnapshot().status;
  if (current === status || isExecutionJobTerminalStatus(current)) return;
  if (
    (current === 'starting' && status === 'queued') ||
    (current === 'running' && (status === 'queued' || status === 'starting')) ||
    (current === 'cancelling' && !isExecutionJobTerminalStatus(status))
  )
    return;
  switch (status) {
    case 'queued':
      return;
    case 'starting':
      controller.markStarting();
      return;
    case 'running':
      controller.markRunning();
      return;
    case 'cancelling':
      controller.markCancelling(reason);
      return;
    default:
      terminal(controller, status, reason);
  }
};

const applyEvent = (
  controller: ExecutionJobController,
  event: ExecutionJobEvent
): void => {
  if (!active(controller)) return;
  switch (event.kind) {
    case 'state':
      applyState(controller, event.snapshot.status, event.reason);
      return;
    case 'log':
      controller.emitLog(event.log);
      return;
    case 'diagnostic':
      if (event.diagnostic.code === EXECUTION_SECRET_LEAK_DIAGNOSTIC_CODE)
        secretLeakDiagnosticControllers.add(controller);
      controller.emitDiagnostic(event.diagnostic);
      return;
    case 'artifact':
      controller.emitArtifact(event.artifact);
      return;
    case 'trace':
      controller.emitTrace(event.trace);
  }
};

const emitSynchronizationFailure = (
  controller: ExecutionJobController,
  error: unknown
): void => {
  if (!active(controller)) return;
  if (
    error instanceof RemoteExecutionClientError ||
    error instanceof RemoteExecutionRecoveryRequiredError
  ) {
    controller.emitDiagnostic(error.diagnostic);
  }
  const operation =
    error instanceof RemoteExecutionClientError ||
    error instanceof RemoteExecutionRecoveryRequiredError
      ? error.operation
      : undefined;
  const recovery = createRemoteExecutionRecoveryPlan({
    error,
    ...(operation ? { operation } : {}),
  });
  if (recovery.status === 'restore-authorization') {
    controller.fail({
      code: 'REMOTE_AUTHORIZATION_REQUIRED',
      message:
        'Remote execution authorization must be restored before resuming this execution.',
      retryable: false,
    });
    return;
  }
  if (
    recovery.status === 'blocked' &&
    recovery.reason === 'permission-denied'
  ) {
    controller.fail({
      code: 'REMOTE_PERMISSION_DENIED',
      message: 'Remote execution permission was denied.',
      retryable: false,
    });
    return;
  }
  controller.fail({
    code: 'REMOTE_EXECUTION_SYNC_FAILED',
    message:
      error instanceof Error
        ? error.message
        : 'Remote execution synchronization failed.',
    retryable: true,
  });
};

const synchronize = async (
  input: Readonly<{
    client: RemoteExecutionClient;
    controller: ExecutionJobController;
    initialRecord: RemoteExecutionRecord;
    pollIntervalMs: number;
    eventPageSize: number;
    maximumReconnectAttempts: number;
    delay: (milliseconds: number) => Promise<void>;
    trustedServerFunctionSourceTrace?: readonly ExecutionSourceTrace[];
    materializeArtifact?: CreateRemoteExecutionProviderOptions['materializeArtifact'];
  }>
): Promise<void> => {
  let cursor = 0;
  let record = input.initialRecord;
  let terminalReason: string | undefined;
  let buildBundlePublished = false;
  let previewBundlePublished = false;
  let serverFunctionResultStatus: 'succeeded' | 'failed' | undefined;
  let serverFunctionResultErrorCode: string | undefined;
  let serverFunctionResultSourceTrace:
    readonly ExecutionSourceTrace[] | undefined;
  let serverFunctionTracePublished = false;
  let testReportStatus: 'passed' | 'failed' | undefined;
  let testReportSourceTrace: readonly ExecutionSourceTrace[] | undefined;
  let testReportTraceStatus: 'passed' | 'failed' | undefined;
  let testServerFunctionTraceCount = 0;
  let reconnectAttempts = 0;
  while (active(input.controller)) {
    try {
      let hasMore = true;
      while (hasMore && active(input.controller)) {
        const page = await input.client.readEvents({
          executionId: record.executionId,
          afterCursor: cursor,
          limit: input.eventPageSize,
        });
        if (!page.events.length && page.latestCursor > cursor) {
          throw new RemoteExecutionRecoveryRequiredError(
            'Remote event replay did not advance to the advertised cursor.',
            'events.read'
          );
        }
        for (const { cursor: eventCursor, event } of page.events) {
          if (event.sequence !== eventCursor) {
            throw new RemoteExecutionRecoveryRequiredError(
              'Remote event sequence does not match its durable cursor.',
              'events.read'
            );
          }
          if (
            event.kind === 'state' &&
            event.snapshot.providerId !== record.provider.id
          ) {
            throw new RemoteExecutionRecoveryRequiredError(
              'Remote state event provider identity drifted.',
              'events.read'
            );
          }
          if (event.kind === 'state' && event.reason)
            terminalReason = event.reason;
          if (
            event.kind === 'artifact' &&
            event.artifact.mediaType === EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE
          ) {
            const changeCount = Number(event.artifact.metadata?.changeCount);
            if (
              event.artifact.kind !== 'report' ||
              event.artifact.artifactId !==
                `filesystem-diff:${record.snapshotDigest}` ||
              event.artifact.metadata?.format !==
                EXECUTION_FILESYSTEM_DIFF_FORMAT ||
              event.artifact.metadata?.snapshotDigest !==
                record.snapshotDigest ||
              !Number.isSafeInteger(changeCount) ||
              changeCount < 0 ||
              (event.artifact.metadata?.complete !== 'true' &&
                event.artifact.metadata?.complete !== 'false')
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote filesystem artifact does not match the execution snapshot.',
                'events.read'
              );
          }
          if (
            event.kind === 'artifact' &&
            event.artifact.mediaType !== EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE &&
            input.controller.job.request.profile === 'preview'
          ) {
            if (
              event.artifact.kind !== 'bundle' ||
              event.artifact.mediaType !==
                EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE ||
              event.artifact.metadata?.snapshotDigest !==
                record.snapshotDigest ||
              event.artifact.metadata?.readiness !== 'ready' ||
              event.artifact.metadata?.health !== 'healthy' ||
              !event.artifact.metadata.entryFilePath
                ?.toLowerCase()
                .endsWith('.html') ||
              !event.artifact.sourceTrace?.length
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote Preview artifact does not match the ready static bundle contract.',
                'events.read'
              );
            previewBundlePublished = true;
          }
          if (
            event.kind === 'artifact' &&
            event.artifact.mediaType !== EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE &&
            input.controller.job.request.profile === 'build'
          ) {
            if (
              event.artifact.kind !== 'bundle' ||
              event.artifact.mediaType !== EXECUTION_BUILD_BUNDLE_MEDIA_TYPE ||
              event.artifact.metadata?.snapshotDigest !==
                record.snapshotDigest ||
              !event.artifact.sourceTrace?.length
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote Build artifact does not match the snapshot result contract.',
                'events.read'
              );
            buildBundlePublished = true;
          }
          if (
            event.kind === 'artifact' &&
            event.artifact.mediaType !== EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE &&
            input.controller.job.request.profile === 'test'
          ) {
            const status = event.artifact.metadata?.status;
            const expectedReportId = `test-report:${record.executionId}`;
            if (
              testReportStatus ||
              event.artifact.kind !== 'report' ||
              event.artifact.mediaType !== EXECUTION_TEST_REPORT_MEDIA_TYPE ||
              event.artifact.artifactId !== expectedReportId ||
              event.artifact.metadata?.reportId !== expectedReportId ||
              event.artifact.metadata?.snapshotDigest !==
                record.snapshotDigest ||
              (status !== 'passed' && status !== 'failed') ||
              !event.artifact.sourceTrace?.length
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote Test artifact does not match the canonical report contract.',
                'events.read'
              );
            testReportStatus = status;
            testReportSourceTrace = event.artifact.sourceTrace;
          }
          if (
            event.kind === 'artifact' &&
            event.artifact.mediaType !== EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE &&
            input.controller.job.request.profile === 'production'
          ) {
            const invocation = readExecutionServerFunctionBridgeRequest(
              input.controller.job.request.invocation.input
            );
            const target = input.controller.job.request.invocation.targetRef;
            const status = event.artifact.metadata?.status;
            const errorCode = event.artifact.metadata?.errorCode;
            if (
              serverFunctionResultStatus ||
              !invocation ||
              event.artifact.kind !== 'report' ||
              event.artifact.mediaType !==
                ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE ||
              event.artifact.metadata?.snapshotDigest !==
                record.snapshotDigest ||
              event.artifact.metadata?.requestId !== invocation.requestId ||
              event.artifact.artifactId !==
                `server-function-result:${record.snapshotDigest}:${invocation.requestId}` ||
              target.kind !== 'code-artifact' ||
              event.artifact.metadata?.artifactId !==
                invocation.functionRef.artifactId ||
              target.artifactId !== invocation.functionRef.artifactId ||
              event.artifact.metadata?.exportName !==
                invocation.functionRef.exportName ||
              input.controller.job.request.invocation.entrypoint !==
                invocation.functionRef.exportName ||
              (status !== 'succeeded' && status !== 'failed') ||
              (status === 'succeeded'
                ? errorCode !== undefined
                : typeof errorCode !== 'string' ||
                  !/^[A-Z][A-Z0-9_-]{0,127}$/u.test(errorCode)) ||
              !hasSingleExactServerFunctionRootSource(
                event.artifact.sourceTrace,
                invocation.functionRef.artifactId
              )
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote Server Function artifact does not match the isolated result contract.',
                'events.read'
              );
            serverFunctionResultStatus = status;
            serverFunctionResultErrorCode = errorCode;
            serverFunctionResultSourceTrace = event.artifact.sourceTrace;
          }
          if (
            event.kind === 'trace' &&
            input.controller.job.request.profile === 'production' &&
            event.trace.name === SERVER_FUNCTION_INVOCATION_TRACE_NAME
          ) {
            const invocation = readExecutionServerFunctionBridgeRequest(
              input.controller.job.request.invocation.input
            );
            const trace = readServerFunctionInvocationTraceValue(
              event.trace.detail
            );
            if (
              serverFunctionTracePublished ||
              !invocation ||
              !trace ||
              !serverFunctionResultStatus ||
              event.trace.phase !== 'event' ||
              event.trace.traceId !== `server-function:${record.executionId}` ||
              event.trace.spanId !== invocation.requestId ||
              trace.requestId !== invocation.requestId ||
              trace.invocationId !== invocation.invocationId ||
              trace.attempt !== invocation.attempt ||
              trace.functionRef.artifactId !==
                invocation.functionRef.artifactId ||
              trace.functionRef.exportName !==
                invocation.functionRef.exportName ||
              (serverFunctionResultStatus === 'succeeded'
                ? trace.outcome !== 'succeeded'
                : trace.outcome === 'succeeded' ||
                  trace.errorCode !== serverFunctionResultErrorCode) ||
              !hasSingleExactServerFunctionRootSource(
                event.trace.sourceTrace,
                invocation.functionRef.artifactId
              ) ||
              !sameSourceTrace(
                event.trace.sourceTrace,
                serverFunctionResultSourceTrace
              )
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote Server Function trace does not match its result artifact and invocation.',
                'events.read'
              );
            serverFunctionTracePublished = true;
          }
          if (
            event.kind === 'trace' &&
            input.controller.job.request.profile === 'test' &&
            event.trace.name === SERVER_FUNCTION_INVOCATION_TRACE_NAME
          ) {
            const trace = readServerFunctionInvocationTraceValue(
              event.trace.detail
            );
            if (
              !testReportTraceStatus ||
              !input.controller.job.request.requiredCapabilities.includes(
                'server-function'
              ) ||
              !trace ||
              testServerFunctionTraceCount >= 10_000 ||
              event.trace.phase !== 'event' ||
              event.trace.traceId !==
                `server-function-test:${record.executionId}` ||
              event.trace.spanId !==
                `${trace.requestId}:${testServerFunctionTraceCount}` ||
              !hasSingleExactServerFunctionRootSource(
                event.trace.sourceTrace,
                trace.functionRef.artifactId
              ) ||
              (input.trustedServerFunctionSourceTrace !== undefined &&
                event.trace.sourceTrace?.some(
                  (candidate) =>
                    !input.trustedServerFunctionSourceTrace!.some((trusted) =>
                      sameSourceTrace([candidate], [trusted])
                    )
                ))
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote Test Server Function trace does not match its report and CodeArtifact source.',
                'events.read'
              );
            testServerFunctionTraceCount += 1;
          }
          if (
            event.kind === 'trace' &&
            input.controller.job.request.profile === 'test' &&
            event.trace.name === EXECUTION_NETWORK_TRACE_NAME
          ) {
            const network = readExecutionNetworkTraceValue(event.trace.detail);
            if (
              !network ||
              event.trace.phase !== 'event' ||
              event.trace.traceId !== `network:${record.executionId}` ||
              event.trace.spanId !== network.requestId ||
              network.runtimeZone !== 'test' ||
              (network.phase === 'dependency-install'
                ? network.mode !== 'live' || network.correlation !== undefined
                : network.mode !== 'mock' || !network.correlation)
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote Test network trace crossed its mock-only runtime boundary.',
                'events.read'
              );
          }
          if (
            event.kind === 'trace' &&
            input.controller.job.request.profile === 'test' &&
            event.trace.name === EXECUTION_TEST_REPORT_TRACE_NAME
          ) {
            const report = readExecutionTestReportValue(event.trace.detail);
            const expectedReportId = `test-report:${record.executionId}`;
            if (
              testReportTraceStatus ||
              !testReportStatus ||
              !report ||
              report.reportId !== expectedReportId ||
              report.status !== testReportStatus ||
              event.trace.phase !== 'event' ||
              event.trace.traceId !== `test:${record.executionId}` ||
              event.trace.spanId !== expectedReportId ||
              !event.trace.sourceTrace?.length ||
              !sameSourceTrace(event.trace.sourceTrace, testReportSourceTrace)
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote Test trace does not match its execution-bound report artifact.',
                'events.read'
              );
            testReportTraceStatus = report.status;
          }
          if (
            event.kind === 'state' &&
            event.snapshot.status === 'succeeded' &&
            input.controller.job.request.profile === 'preview' &&
            !previewBundlePublished
          )
            throw new RemoteExecutionRecoveryRequiredError(
              'Remote Preview succeeded without a verified ready bundle artifact.',
              'events.read'
            );
          if (
            event.kind === 'state' &&
            event.snapshot.status === 'succeeded' &&
            input.controller.job.request.profile === 'build' &&
            !buildBundlePublished
          )
            throw new RemoteExecutionRecoveryRequiredError(
              'Remote Build succeeded without a verified bundle artifact.',
              'events.read'
            );
          if (
            event.kind === 'state' &&
            event.snapshot.status === 'succeeded' &&
            input.controller.job.request.profile === 'production' &&
            (!serverFunctionResultStatus || !serverFunctionTracePublished)
          )
            throw new RemoteExecutionRecoveryRequiredError(
              'Remote Server Function succeeded without a verified result artifact and trace.',
              'events.read'
            );
          if (
            event.kind === 'state' &&
            event.snapshot.status === 'succeeded' &&
            input.controller.job.request.profile === 'test' &&
            (testReportStatus !== 'passed' ||
              testReportTraceStatus !== 'passed')
          )
            throw new RemoteExecutionRecoveryRequiredError(
              'Remote Test succeeded without a passing canonical report.',
              'events.read'
            );
          if (
            event.kind === 'state' &&
            event.snapshot.status === 'failed' &&
            input.controller.job.request.profile === 'test' &&
            (testReportStatus === 'passed' ||
              testReportTraceStatus === 'passed')
          )
            throw new RemoteExecutionRecoveryRequiredError(
              'Remote Test failed after publishing a passing canonical report.',
              'events.read'
            );
          if (
            event.kind === 'state' &&
            isExecutionJobTerminalStatus(event.snapshot.status) &&
            input.controller.job.request.profile === 'test' &&
            testReportStatus !== testReportTraceStatus
          )
            throw new RemoteExecutionRecoveryRequiredError(
              'Remote Test report artifact and trace status diverged.',
              'events.read'
            );
          let projectedEvent = event;
          if (
            event.kind === 'artifact' &&
            (event.artifact.mediaType === EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE ||
              event.artifact.mediaType ===
                ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE) &&
            input.materializeArtifact
          ) {
            const artifact = await input.materializeArtifact({
              executionId: record.executionId,
              snapshotDigest: record.snapshotDigest,
              artifact: event.artifact,
            });
            if (
              artifact.artifactId !== event.artifact.artifactId ||
              artifact.kind !== event.artifact.kind ||
              artifact.mediaType !== event.artifact.mediaType ||
              artifact.digest !== event.artifact.digest ||
              artifact.size !== event.artifact.size ||
              !artifact.uri ||
              artifact.uri !== artifact.uri.trim()
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote artifact materialization changed durable artifact identity.',
                'events.read'
              );
            const expectedProjection = Object.freeze({
              ...event.artifact,
              uri: artifact.uri,
            });
            if (JSON.stringify(artifact) !== JSON.stringify(expectedProjection))
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote artifact materialization may only add its runtime URI.',
                'events.read'
              );
            projectedEvent = Object.freeze({ ...event, artifact });
          }
          applyEvent(input.controller, projectedEvent);
          cursor = eventCursor;
        }
        hasMore = page.hasMore;
      }
      if (!active(input.controller)) return;
      record = await input.client.get(record.executionId);
      if (isExecutionJobTerminalStatus(record.status)) {
        if (cursor < record.latestCursor) continue;
        terminal(input.controller, record.status, terminalReason);
        return;
      }
      reconnectAttempts = 0;
      await input.delay(input.pollIntervalMs);
    } catch (error) {
      const recovery = createRemoteExecutionRecoveryPlan({
        error,
        ...(error instanceof RemoteExecutionClientError ||
        error instanceof RemoteExecutionRecoveryRequiredError
          ? { operation: error.operation }
          : {}),
        afterCursor: cursor,
      });
      if (
        recovery.status !== 'reconnect' ||
        reconnectAttempts >= input.maximumReconnectAttempts
      ) {
        emitSynchronizationFailure(input.controller, error);
        return;
      }
      reconnectAttempts += 1;
      try {
        const refreshed = await reconnectRemoteExecution({
          client: input.client,
          expected: {
            executionId: record.executionId,
            requestId: record.requestId,
            snapshotDigest: record.snapshotDigest,
            providerId: record.provider.id,
          },
          afterCursor: cursor,
          pageSize: input.eventPageSize,
          maximumPages: 1,
        });
        record = refreshed.execution;
      } catch (reconnectError) {
        if (reconnectAttempts >= input.maximumReconnectAttempts) {
          emitSynchronizationFailure(input.controller, reconnectError);
          return;
        }
      }
      await input.delay(input.pollIntervalMs);
    }
  }
};

/** Projects durable Remote execution state into the canonical provider/job contract. */
export const createRemoteExecutionProvider = (
  options: CreateRemoteExecutionProviderOptions
): ExecutionProvider => {
  if (options.descriptor.isolation !== 'remote-isolated')
    throw new TypeError(
      'Remote provider must declare remote-isolated isolation.'
    );
  if (!options.descriptor.capabilities.includes('cancellation'))
    throw new TypeError(
      'Remote provider projection requires cancellation capability.'
    );
  const pollIntervalMs = positiveSafeInteger(
    options.pollIntervalMs ?? 250,
    'Remote provider poll interval'
  );
  const eventPageSize = positiveSafeInteger(
    options.eventPageSize ?? 200,
    'Remote provider event page size'
  );
  if (eventPageSize > REMOTE_EXECUTION_PROTOCOL_LIMITS.maxArrayEntries)
    throw new TypeError(
      'Remote provider event page size exceeds protocol limits.'
    );
  const maximumReconnectAttempts = positiveSafeInteger(
    options.maximumReconnectAttempts ?? 3,
    'Remote provider maximum reconnect attempts'
  );
  const delay = options.delay ?? defaultDelay;
  return Object.freeze({
    descriptor: options.descriptor,
    async start(request) {
      if (
        request.profile === 'test' &&
        (request.environment !== undefined ||
          request.requiredCapabilities.includes('environment-binding'))
      )
        throw new TypeError(
          'Remote Test is mock-only and cannot accept an environment binding.'
        );
      const compatibility = getExecutionProviderCompatibility(
        options.descriptor,
        request
      );
      if (!compatibility.compatible)
        throw new Error(
          'Remote execution provider cannot satisfy this request.'
        );
      const snapshot = await options.resolveSnapshot(request);
      const trustedServerFunctionSourceTrace =
        snapshot.kind === 'upload'
          ? snapshot.snapshot.files.flatMap((file) => file.sourceTrace ?? [])
          : undefined;
      if (snapshot.kind === 'upload') {
        if (
          request.profile === 'production' &&
          !snapshot.snapshot.serverFunctionPlan
        ) {
          throw new TypeError(
            'Remote Server Function execution requires an isolated production plan.'
          );
        }
        assertExecutableProjectCapabilitySupport(
          snapshot.snapshot,
          request.profile,
          options.descriptor.capabilities
        );
        if (request.profile === 'test') {
          const requestRequiresServerFunction =
            request.requiredCapabilities.includes('server-function');
          const snapshotRequiresServerFunction =
            snapshot.snapshot.capabilityRequirements.test.includes(
              'server-function'
            );
          if (
            requestRequiresServerFunction !== snapshotRequiresServerFunction ||
            snapshotRequiresServerFunction !==
              Boolean(snapshot.snapshot.serverRuntimeMockProvision)
          )
            throw new TypeError(
              'Remote Test Server Function capability does not match its deterministic runtime provision.'
            );
        }
      }
      const { execution } = await options.client.create({ request, snapshot });
      if (!acceptedProviderMatches(options.descriptor, execution.provider)) {
        throw new RemoteExecutionRecoveryRequiredError(
          'Remote router selected an unexpected provider identity.',
          'create'
        );
      }
      let controller: ExecutionJobController;
      controller = createExecutionJobController({
        jobId: execution.executionId,
        request,
        provider: options.descriptor,
        requestCancellation: async ({ reason }) => {
          const cancellationId = (
            options.createCancellationId ??
            ((executionId, executionRequest) =>
              `${executionRequest.requestId}:${executionId}:cancel`)
          )(execution.executionId, request);
          if (
            cancellationId !== cancellationId.trim() ||
            !cancellationId ||
            cancellationId.length >
              REMOTE_EXECUTION_PROTOCOL_LIMITS.maxIdentifierLength
          )
            throw new TypeError('Remote cancellation identity is invalid.');
          const cancellation = await options.client.cancel({
            executionId: execution.executionId,
            cancellationId,
            ...(reason ? { reason } : {}),
          });
          switch (cancellation.result.status) {
            case 'accepted':
            case 'already-requested':
            case 'already-terminal':
              return 'accepted';
            case 'unsupported':
              return 'unsupported';
            case 'rejected':
              throw new Error(
                cancellation.result.reason ??
                  'Remote execution cancellation was rejected.'
              );
          }
        },
      });
      void synchronize({
        client: options.client,
        controller,
        initialRecord: execution,
        pollIntervalMs,
        eventPageSize,
        maximumReconnectAttempts,
        delay,
        ...(trustedServerFunctionSourceTrace
          ? { trustedServerFunctionSourceTrace }
          : {}),
        ...(options.materializeArtifact
          ? { materializeArtifact: options.materializeArtifact }
          : {}),
      });
      return controller.job;
    },
  });
};

type StandardRemoteExecutionProviderOptions = Omit<
  CreateRemoteExecutionProviderOptions,
  'descriptor'
>;

export const createRemotePreviewExecutionProvider = (
  options: StandardRemoteExecutionProviderOptions
): ExecutionProvider =>
  createRemoteExecutionProvider({
    ...options,
    descriptor: remotePreviewExecutionProviderDescriptor,
  });

export const createRemoteTestExecutionProvider = (
  options: StandardRemoteExecutionProviderOptions
): ExecutionProvider =>
  createRemoteExecutionProvider({
    ...options,
    descriptor: remoteTestExecutionProviderDescriptor,
  });

export const createRemoteBuildExecutionProvider = (
  options: StandardRemoteExecutionProviderOptions
): ExecutionProvider =>
  createRemoteExecutionProvider({
    ...options,
    descriptor: remoteBuildExecutionProviderDescriptor,
  });

export const createRemoteServerFunctionExecutionProvider = (
  options: StandardRemoteExecutionProviderOptions
): ExecutionProvider =>
  createRemoteExecutionProvider({
    ...options,
    descriptor: remoteServerFunctionExecutionProviderDescriptor,
  });
