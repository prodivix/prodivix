import {
  EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
  EXECUTION_FILESYSTEM_DIFF_FORMAT,
  EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE,
  EXECUTION_NETWORK_TRACE_NAME,
  EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_TRACE_NAME,
  isExecutionJobTerminalStatus,
  readExecutionNetworkTraceValue,
  readExecutionTestReportValue,
  type ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import {
  ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
  readExecutionServerFunctionBridgeRequest,
  readServerFunctionInvocationTraceValue,
  SERVER_FUNCTION_INVOCATION_TRACE_NAME,
} from '@prodivix/server-runtime';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  RemoteExecutionClientError,
  RemoteExecutionRecoveryRequiredError,
} from './remoteExecutionClient';
import {
  applyRemoteExecutionEvent,
  digestRemoteExecutionEvent,
  finishRemoteExecutionProjection,
  isRemoteExecutionProjectionActive,
  type RemoteExecutionArtifactMaterializer,
  type RemoteExecutionProjectionState,
} from './remoteExecutionProviderProjection';
import {
  assertRemoteExecutionEventPage,
  assertRemoteExecutionRecordProgress,
  validateRemoteExecutionResumeAnchor,
} from './remoteExecutionProviderValidation';
import {
  createRemoteExecutionRecoveryPlan,
  reconnectRemoteExecution,
} from './remoteExecutionRecovery';
import type { RemoteExecutionClient } from './remoteExecutionProtocol.types';

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

const sameSourceTrace = (
  left: readonly ExecutionSourceTrace[] | undefined,
  right: readonly ExecutionSourceTrace[] | undefined
): boolean => sameCanonicalJson(left, right);

const emitSynchronizationFailure = (
  state: RemoteExecutionProjectionState,
  error: unknown
): void => {
  const { controller } = state;
  if (!isRemoteExecutionProjectionActive(controller)) return;
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

export const synchronizeRemoteExecutionProjection = async (
  input: Readonly<{
    client: RemoteExecutionClient;
    state: RemoteExecutionProjectionState;
    generation: number;
    pollIntervalMs: number;
    eventPageSize: number;
    maximumReconnectAttempts: number;
    delay: (milliseconds: number) => Promise<void>;
    materializeArtifact?: RemoteExecutionArtifactMaterializer;
  }>
): Promise<void> => {
  const current = (): boolean =>
    isRemoteExecutionProjectionActive(input.state.controller) &&
    input.state.generation === input.generation;
  let reconnectAttempts = 0;
  try {
    await validateRemoteExecutionResumeAnchor({
      client: input.client,
      state: input.state,
      eventPageSize: input.eventPageSize,
      generation: input.generation,
    });
  } catch (error) {
    if (input.state.generation !== input.generation) return;
    emitSynchronizationFailure(input.state, error);
    return;
  }
  while (current()) {
    try {
      let hasMore = true;
      while (hasMore && current()) {
        const page = await input.client.readEvents({
          executionId: input.state.record.executionId,
          afterCursor: input.state.cursor,
          limit: input.eventPageSize,
        });
        if (!current()) return;
        const events = assertRemoteExecutionEventPage(input.state, page);
        for (const { cursor: eventCursor, event } of events) {
          if (!current()) return;
          let pendingTerminalReason: string | undefined;
          let pendingPreviewBundlePublished = false;
          let pendingBuildBundlePublished = false;
          let pendingTestReport = false;
          let pendingTestReportStatus: 'passed' | 'failed' | undefined;
          let pendingTestReportSourceTrace:
            readonly ExecutionSourceTrace[] | undefined;
          let pendingServerFunctionResult = false;
          let pendingServerFunctionResultStatus:
            'succeeded' | 'failed' | undefined;
          let pendingServerFunctionResultErrorCode: string | undefined;
          let pendingServerFunctionResultSourceTrace:
            readonly ExecutionSourceTrace[] | undefined;
          let pendingServerFunctionTracePublished = false;
          let pendingTestServerFunctionTrace = false;
          let pendingTestReportTraceStatus: 'passed' | 'failed' | undefined;
          if (
            event.kind === 'state' &&
            event.snapshot.providerId !== input.state.record.provider.id
          ) {
            throw new RemoteExecutionRecoveryRequiredError(
              'Remote state event provider identity drifted.',
              'events.read'
            );
          }
          if (event.kind === 'state' && event.reason)
            pendingTerminalReason = event.reason;
          if (
            event.kind === 'artifact' &&
            event.artifact.mediaType === EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE
          ) {
            const changeCount = Number(event.artifact.metadata?.changeCount);
            if (
              event.artifact.kind !== 'report' ||
              event.artifact.artifactId !==
                `filesystem-diff:${input.state.record.snapshotDigest}` ||
              event.artifact.metadata?.format !==
                EXECUTION_FILESYSTEM_DIFF_FORMAT ||
              event.artifact.metadata?.snapshotDigest !==
                input.state.record.snapshotDigest ||
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
            input.state.controller.job.request.profile === 'preview'
          ) {
            if (
              event.artifact.kind !== 'bundle' ||
              event.artifact.mediaType !==
                EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE ||
              event.artifact.metadata?.snapshotDigest !==
                input.state.record.snapshotDigest ||
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
            pendingPreviewBundlePublished = true;
          }
          if (
            event.kind === 'artifact' &&
            event.artifact.mediaType !== EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE &&
            input.state.controller.job.request.profile === 'build'
          ) {
            if (
              event.artifact.kind !== 'bundle' ||
              event.artifact.mediaType !== EXECUTION_BUILD_BUNDLE_MEDIA_TYPE ||
              event.artifact.metadata?.snapshotDigest !==
                input.state.record.snapshotDigest ||
              !event.artifact.sourceTrace?.length
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote Build artifact does not match the snapshot result contract.',
                'events.read'
              );
            pendingBuildBundlePublished = true;
          }
          if (
            event.kind === 'artifact' &&
            event.artifact.mediaType !== EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE &&
            input.state.controller.job.request.profile === 'test'
          ) {
            const status = event.artifact.metadata?.status;
            const expectedReportId = `test-report:${input.state.record.executionId}`;
            if (
              input.state.testReportStatus ||
              event.artifact.kind !== 'report' ||
              event.artifact.mediaType !== EXECUTION_TEST_REPORT_MEDIA_TYPE ||
              event.artifact.artifactId !== expectedReportId ||
              event.artifact.metadata?.reportId !== expectedReportId ||
              event.artifact.metadata?.snapshotDigest !==
                input.state.record.snapshotDigest ||
              (status !== 'passed' && status !== 'failed') ||
              !event.artifact.sourceTrace?.length
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote Test artifact does not match the canonical report contract.',
                'events.read'
              );
            pendingTestReport = true;
            pendingTestReportStatus = status;
            pendingTestReportSourceTrace = event.artifact.sourceTrace;
          }
          if (
            event.kind === 'artifact' &&
            event.artifact.mediaType !== EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE &&
            input.state.controller.job.request.profile === 'production'
          ) {
            const invocation = readExecutionServerFunctionBridgeRequest(
              input.state.controller.job.request.invocation.input
            );
            const target =
              input.state.controller.job.request.invocation.targetRef;
            const status = event.artifact.metadata?.status;
            const errorCode = event.artifact.metadata?.errorCode;
            if (
              input.state.serverFunctionResultStatus ||
              !invocation ||
              event.artifact.kind !== 'report' ||
              event.artifact.mediaType !==
                ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE ||
              event.artifact.metadata?.snapshotDigest !==
                input.state.record.snapshotDigest ||
              event.artifact.metadata?.requestId !== invocation.requestId ||
              event.artifact.artifactId !==
                `server-function-result:${input.state.record.snapshotDigest}:${invocation.requestId}` ||
              target.kind !== 'code-artifact' ||
              event.artifact.metadata?.artifactId !==
                invocation.functionRef.artifactId ||
              target.artifactId !== invocation.functionRef.artifactId ||
              event.artifact.metadata?.exportName !==
                invocation.functionRef.exportName ||
              input.state.controller.job.request.invocation.entrypoint !==
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
            pendingServerFunctionResult = true;
            pendingServerFunctionResultStatus = status;
            pendingServerFunctionResultErrorCode = errorCode;
            pendingServerFunctionResultSourceTrace = event.artifact.sourceTrace;
          }
          if (
            event.kind === 'trace' &&
            input.state.controller.job.request.profile === 'production' &&
            event.trace.name === SERVER_FUNCTION_INVOCATION_TRACE_NAME
          ) {
            const invocation = readExecutionServerFunctionBridgeRequest(
              input.state.controller.job.request.invocation.input
            );
            const trace = readServerFunctionInvocationTraceValue(
              event.trace.detail
            );
            if (
              input.state.serverFunctionTracePublished ||
              !invocation ||
              !trace ||
              !input.state.serverFunctionResultStatus ||
              event.trace.phase !== 'event' ||
              event.trace.traceId !==
                `server-function:${input.state.record.executionId}` ||
              event.trace.spanId !== invocation.requestId ||
              trace.requestId !== invocation.requestId ||
              trace.invocationId !== invocation.invocationId ||
              trace.attempt !== invocation.attempt ||
              trace.functionRef.artifactId !==
                invocation.functionRef.artifactId ||
              trace.functionRef.exportName !==
                invocation.functionRef.exportName ||
              (input.state.serverFunctionResultStatus === 'succeeded'
                ? trace.outcome !== 'succeeded'
                : trace.outcome === 'succeeded' ||
                  trace.errorCode !==
                    input.state.serverFunctionResultErrorCode) ||
              !hasSingleExactServerFunctionRootSource(
                event.trace.sourceTrace,
                invocation.functionRef.artifactId
              ) ||
              !sameSourceTrace(
                event.trace.sourceTrace,
                input.state.serverFunctionResultSourceTrace
              )
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote Server Function trace does not match its result artifact and invocation.',
                'events.read'
              );
            pendingServerFunctionTracePublished = true;
          }
          if (
            event.kind === 'trace' &&
            input.state.controller.job.request.profile === 'test' &&
            event.trace.name === SERVER_FUNCTION_INVOCATION_TRACE_NAME
          ) {
            const trace = readServerFunctionInvocationTraceValue(
              event.trace.detail
            );
            if (
              !input.state.testReportTraceStatus ||
              !input.state.controller.job.request.requiredCapabilities.includes(
                'server-function'
              ) ||
              !trace ||
              input.state.testServerFunctionTraceCount >= 10_000 ||
              event.trace.phase !== 'event' ||
              event.trace.traceId !==
                `server-function-test:${input.state.record.executionId}` ||
              event.trace.spanId !==
                `${trace.requestId}:${input.state.testServerFunctionTraceCount}` ||
              !hasSingleExactServerFunctionRootSource(
                event.trace.sourceTrace,
                trace.functionRef.artifactId
              ) ||
              (input.state.trustedServerFunctionSourceTrace !== undefined &&
                event.trace.sourceTrace?.some(
                  (candidate) =>
                    !input.state.trustedServerFunctionSourceTrace!.some(
                      (trusted) => sameSourceTrace([candidate], [trusted])
                    )
                ))
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote Test Server Function trace does not match its report and CodeArtifact source.',
                'events.read'
              );
            pendingTestServerFunctionTrace = true;
          }
          if (
            event.kind === 'trace' &&
            input.state.controller.job.request.profile === 'test' &&
            event.trace.name === EXECUTION_NETWORK_TRACE_NAME
          ) {
            const network = readExecutionNetworkTraceValue(event.trace.detail);
            if (
              !network ||
              event.trace.phase !== 'event' ||
              event.trace.traceId !==
                `network:${input.state.record.executionId}` ||
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
            input.state.controller.job.request.profile === 'test' &&
            event.trace.name === EXECUTION_TEST_REPORT_TRACE_NAME
          ) {
            const report = readExecutionTestReportValue(event.trace.detail);
            const expectedReportId = `test-report:${input.state.record.executionId}`;
            if (
              input.state.testReportTraceStatus ||
              !input.state.testReportStatus ||
              !report ||
              report.reportId !== expectedReportId ||
              report.status !== input.state.testReportStatus ||
              event.trace.phase !== 'event' ||
              event.trace.traceId !==
                `test:${input.state.record.executionId}` ||
              event.trace.spanId !== expectedReportId ||
              !event.trace.sourceTrace?.length ||
              !sameSourceTrace(
                event.trace.sourceTrace,
                input.state.testReportSourceTrace
              )
            )
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote Test trace does not match its execution-bound report artifact.',
                'events.read'
              );
            pendingTestReportTraceStatus = report.status;
          }
          if (
            event.kind === 'state' &&
            event.snapshot.status === 'succeeded' &&
            input.state.controller.job.request.profile === 'preview' &&
            !input.state.previewBundlePublished
          )
            throw new RemoteExecutionRecoveryRequiredError(
              'Remote Preview succeeded without a verified ready bundle artifact.',
              'events.read'
            );
          if (
            event.kind === 'state' &&
            event.snapshot.status === 'succeeded' &&
            input.state.controller.job.request.profile === 'build' &&
            !input.state.buildBundlePublished
          )
            throw new RemoteExecutionRecoveryRequiredError(
              'Remote Build succeeded without a verified bundle artifact.',
              'events.read'
            );
          if (
            event.kind === 'state' &&
            event.snapshot.status === 'succeeded' &&
            input.state.controller.job.request.profile === 'production' &&
            (!input.state.serverFunctionResultStatus ||
              !input.state.serverFunctionTracePublished)
          )
            throw new RemoteExecutionRecoveryRequiredError(
              'Remote Server Function succeeded without a verified result artifact and trace.',
              'events.read'
            );
          if (
            event.kind === 'state' &&
            event.snapshot.status === 'succeeded' &&
            input.state.controller.job.request.profile === 'test' &&
            (input.state.testReportStatus !== 'passed' ||
              input.state.testReportTraceStatus !== 'passed')
          )
            throw new RemoteExecutionRecoveryRequiredError(
              'Remote Test succeeded without a passing canonical report.',
              'events.read'
            );
          if (
            event.kind === 'state' &&
            event.snapshot.status === 'failed' &&
            input.state.controller.job.request.profile === 'test' &&
            (input.state.testReportStatus === 'passed' ||
              input.state.testReportTraceStatus === 'passed')
          )
            throw new RemoteExecutionRecoveryRequiredError(
              'Remote Test failed after publishing a passing canonical report.',
              'events.read'
            );
          if (
            event.kind === 'state' &&
            isExecutionJobTerminalStatus(event.snapshot.status) &&
            input.state.controller.job.request.profile === 'test' &&
            input.state.testReportStatus !== input.state.testReportTraceStatus
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
              executionId: input.state.record.executionId,
              snapshotDigest: input.state.record.snapshotDigest,
              artifact: event.artifact,
            });
            if (!current()) return;
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
            if (!sameCanonicalJson(artifact, expectedProjection))
              throw new RemoteExecutionRecoveryRequiredError(
                'Remote artifact materialization may only add its runtime URI.',
                'events.read'
              );
            projectedEvent = Object.freeze({ ...event, artifact });
          }
          const confirmedEventDigest = digestRemoteExecutionEvent(event);
          applyRemoteExecutionEvent(input.state.controller, projectedEvent);
          input.state.cursor = eventCursor;
          input.state.confirmedEventDigest = confirmedEventDigest;
          if (event.kind === 'state') {
            input.state.remoteStatus = event.snapshot.status;
          }
          if (pendingTerminalReason !== undefined) {
            input.state.terminalReason = pendingTerminalReason;
          }
          if (pendingPreviewBundlePublished) {
            input.state.previewBundlePublished = true;
          }
          if (pendingBuildBundlePublished) {
            input.state.buildBundlePublished = true;
          }
          if (pendingTestReport) {
            input.state.testReportStatus = pendingTestReportStatus;
            input.state.testReportSourceTrace = pendingTestReportSourceTrace;
          }
          if (pendingServerFunctionResult) {
            input.state.serverFunctionResultStatus =
              pendingServerFunctionResultStatus;
            input.state.serverFunctionResultErrorCode =
              pendingServerFunctionResultErrorCode;
            input.state.serverFunctionResultSourceTrace =
              pendingServerFunctionResultSourceTrace;
          }
          if (pendingServerFunctionTracePublished) {
            input.state.serverFunctionTracePublished = true;
          }
          if (pendingTestServerFunctionTrace) {
            input.state.testServerFunctionTraceCount += 1;
          }
          if (pendingTestReportTraceStatus !== undefined) {
            input.state.testReportTraceStatus = pendingTestReportTraceStatus;
          }
        }
        hasMore = page.hasMore;
      }
      if (!current()) return;
      const refreshedRecord = await input.client.get(
        input.state.record.executionId
      );
      if (!current()) return;
      assertRemoteExecutionRecordProgress(input.state, refreshedRecord);
      input.state.record = refreshedRecord;
      if (isExecutionJobTerminalStatus(refreshedRecord.status)) {
        if (input.state.cursor < refreshedRecord.latestCursor) continue;
        finishRemoteExecutionProjection(
          input.state.controller,
          refreshedRecord.status,
          input.state.terminalReason
        );
        return;
      }
      reconnectAttempts = 0;
      await input.delay(input.pollIntervalMs);
    } catch (error) {
      if (!current()) return;
      const recovery = createRemoteExecutionRecoveryPlan({
        error,
        ...(error instanceof RemoteExecutionClientError ||
        error instanceof RemoteExecutionRecoveryRequiredError
          ? { operation: error.operation }
          : {}),
        afterCursor: input.state.cursor,
      });
      if (
        recovery.status !== 'reconnect' ||
        reconnectAttempts >= input.maximumReconnectAttempts
      ) {
        emitSynchronizationFailure(input.state, error);
        return;
      }
      reconnectAttempts += 1;
      try {
        const refreshed = await reconnectRemoteExecution({
          client: input.client,
          expected: {
            executionId: input.state.record.executionId,
            requestId: input.state.record.requestId,
            snapshotDigest: input.state.record.snapshotDigest,
            providerId: input.state.record.provider.id,
          },
          afterCursor: input.state.cursor,
          pageSize: input.eventPageSize,
          maximumPages: 1,
        });
        if (!current()) return;
        assertRemoteExecutionRecordProgress(input.state, refreshed.execution);
        input.state.record = refreshed.execution;
      } catch (reconnectError) {
        if (!current()) return;
        if (reconnectAttempts >= input.maximumReconnectAttempts) {
          emitSynchronizationFailure(input.state, reconnectError);
          return;
        }
      }
      await input.delay(input.pollIntervalMs);
    }
  }
};
