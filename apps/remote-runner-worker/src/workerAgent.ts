import { createHash } from 'node:crypto';
import {
  createExecutionNetworkTrace,
  EXECUTION_NETWORK_TRACE_NAME,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_TRACE_NAME,
  readExecutionTestReportValue,
  toExecutionNetworkTraceValue,
  toExecutionTestReportValue,
  type ExecutionJobStatus,
} from '@prodivix/runtime-core';
import type {
  RemoteWorkerControlPlaneClient,
  RemoteWorkerSandbox,
} from './worker.types';

export type CreateRemoteWorkerAgentOptions = Readonly<{
  workerId: string;
  providerId: string;
  client: RemoteWorkerControlPlaneClient;
  sandbox: RemoteWorkerSandbox;
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
  defaultTimeoutMs: number;
  defaultMaximumOutputBytes: number;
  artifactRetentionMs?: number;
  now?: () => number;
  redactValues?: readonly string[];
}>;

const profiles = new Set(['preview', 'test', 'build']);

const terminalStatus = (
  status: 'succeeded' | 'failed' | 'timed-out' | 'cancelled'
): ExecutionJobStatus => status;

/** Coordinates one claim at a time and aborts execution immediately when lease ownership is lost. */
export const createRemoteWorkerAgent = (
  options: CreateRemoteWorkerAgentOptions
) => {
  if (options.heartbeatIntervalMs >= options.leaseDurationMs)
    throw new TypeError(
      'Remote worker heartbeat must be shorter than its lease.'
    );
  const artifactRetentionMs = options.artifactRetentionMs ?? 60 * 60 * 1_000;
  if (!Number.isSafeInteger(artifactRetentionMs) || artifactRetentionMs < 1)
    throw new TypeError(
      'Remote worker artifact retention must be a positive integer.'
    );
  const now = options.now ?? Date.now;

  const pollOnce = async (): Promise<boolean> => {
    const claim = await options.client.claim({
      workerId: options.workerId,
      providerId: options.providerId,
      leaseDurationMs: options.leaseDurationMs,
    });
    if (!claim) return false;
    const executionId = claim.execution.record.executionId;
    const leaseToken = claim.lease.token;
    const abort = new AbortController();
    let heartbeatFailure: unknown;
    let heartbeatBusy = false;
    let cancellationRequested = false;
    const heartbeat = setInterval(() => {
      if (heartbeatBusy || abort.signal.aborted) return;
      heartbeatBusy = true;
      void options.client
        .renew({
          executionId,
          workerId: options.workerId,
          leaseToken,
          leaseDurationMs: options.leaseDurationMs,
        })
        .then((renewal) => {
          if (!renewal) abort.abort('lease-lost');
          else if (renewal.cancellationRequested) {
            cancellationRequested = true;
            abort.abort('cancellation-requested');
          }
        })
        .catch((error) => {
          heartbeatFailure = error;
          abort.abort('heartbeat-failed');
        })
        .finally(() => {
          heartbeatBusy = false;
        });
    }, options.heartbeatIntervalMs);
    try {
      const profile = claim.execution.request.profile;
      if (!profiles.has(profile)) {
        await options.client.transition({
          executionId,
          workerId: options.workerId,
          leaseToken,
          status: 'failed',
          reason: 'unsupported-profile',
        });
        return true;
      }
      const snapshot = await options.client.snapshot({
        executionId,
        workerId: options.workerId,
        leaseToken,
      });
      if (!snapshot) {
        abort.abort('lease-lost');
        return true;
      }
      const running = await options.client.transition({
        executionId,
        workerId: options.workerId,
        leaseToken,
        status: 'running',
      });
      if (!running) {
        abort.abort('lease-lost');
        return true;
      }
      const result = await options.sandbox.execute({
        executionId,
        snapshot,
        profile: profile as 'preview' | 'test' | 'build',
        timeoutMs:
          claim.execution.request.timeoutMs ??
          snapshot.resourceHints.timeoutMs ??
          options.defaultTimeoutMs,
        maximumOutputBytes:
          snapshot.resourceHints.maxOutputBytes ??
          options.defaultMaximumOutputBytes,
        redactValues: options.redactValues ?? [],
        signal: abort.signal,
      });
      if (abort.signal.aborted) {
        if (cancellationRequested) {
          await options.client.transition({
            executionId,
            workerId: options.workerId,
            leaseToken,
            status: 'cancelled',
            reason: 'cancellation-requested',
          });
        }
        return true;
      }
      const installSourceTrace = snapshot.files.find(
        (file) => file.path === snapshot.dependencyPlan.manifestFilePath
      )?.sourceTrace;
      for (const [index, network] of (result.networkTraces ?? []).entries()) {
        const trace = createExecutionNetworkTrace({
          requestId: network.requestId,
          phase: 'dependency-install',
          runtimeZone: claim.execution.request.runtimeZone,
          mode: 'live',
          adapter: 'remote-install-egress-proxy',
          method: network.method,
          sanitizedUrl: network.sanitizedUrl,
          protocol: network.protocol,
          startedAt: network.startedAt,
          completedAt: network.completedAt,
          outcome: network.outcome,
          status: network.status,
          requestBytes: network.requestBytes,
          responseBytes: network.responseBytes,
          ...(installSourceTrace ? { sourceTrace: installSourceTrace } : {}),
        });
        const appended = await options.client.appendEvent({
          executionId,
          workerId: options.workerId,
          leaseToken,
          workerEventId: `${claim.lease.attempt}:network:install:${index}`,
          event: {
            kind: 'trace',
            trace: {
              traceId: `network:${executionId}`,
              spanId: network.requestId,
              name: EXECUTION_NETWORK_TRACE_NAME,
              phase: 'event',
              detail: toExecutionNetworkTraceValue(trace),
              ...(trace.sourceTrace ? { sourceTrace: trace.sourceTrace } : {}),
            },
          },
        });
        if (appended === 'budget-exceeded') {
          await options.client.transition({
            executionId,
            workerId: options.workerId,
            leaseToken,
            status: 'failed',
            reason: 'event-budget-exceeded',
          });
          return true;
        }
        if (appended === 'rejected') {
          abort.abort('lease-lost');
          return true;
        }
      }
      for (const [stream, message] of [
        ['stdout', result.stdout],
        ['stderr', result.stderr],
      ] as const) {
        if (!message) continue;
        const appended = await options.client.appendEvent({
          executionId,
          workerId: options.workerId,
          leaseToken,
          workerEventId: `${claim.lease.attempt}:output:${stream}`,
          event: {
            kind: 'log',
            log: {
              stream,
              level: stream === 'stderr' ? 'error' : 'info',
              message,
              redacted: true,
            },
          },
        });
        if (appended === 'budget-exceeded') {
          await options.client.transition({
            executionId,
            workerId: options.workerId,
            leaseToken,
            status: 'failed',
            reason: 'output-budget-exceeded',
          });
          return true;
        }
        if (appended === 'rejected') {
          abort.abort('lease-lost');
          return true;
        }
      }
      if (result.outputTruncated) {
        const appended = await options.client.appendEvent({
          executionId,
          workerId: options.workerId,
          leaseToken,
          workerEventId: `${claim.lease.attempt}:output:truncated`,
          event: {
            kind: 'log',
            log: {
              stream: 'console',
              level: 'warning',
              message:
                'Remote execution output exceeded its configured budget and was truncated.',
              redacted: true,
            },
          },
        });
        if (appended === 'budget-exceeded') {
          await options.client.transition({
            executionId,
            workerId: options.workerId,
            leaseToken,
            status: 'failed',
            reason: 'output-budget-exceeded',
          });
          return true;
        }
        if (appended === 'rejected') {
          abort.abort('lease-lost');
          return true;
        }
      }
      for (const [index, artifact] of (result.artifacts ?? []).entries()) {
        if (artifact.mediaType === EXECUTION_TEST_REPORT_MEDIA_TYPE) {
          let report: ReturnType<typeof readExecutionTestReportValue>;
          try {
            report = readExecutionTestReportValue(
              JSON.parse(
                Buffer.from(artifact.contents).toString('utf8')
              ) as unknown
            );
          } catch {
            report = undefined;
          }
          if (!report) {
            await options.client.transition({
              executionId,
              workerId: options.workerId,
              leaseToken,
              status: 'failed',
              reason: 'invalid-test-report',
            });
            return true;
          }
          const appended = await options.client.appendEvent({
            executionId,
            workerId: options.workerId,
            leaseToken,
            workerEventId: `${claim.lease.attempt}:test-report:trace`,
            event: {
              kind: 'trace',
              trace: {
                traceId: `test:${executionId}`,
                spanId: `test-report:${executionId}`,
                name: EXECUTION_TEST_REPORT_TRACE_NAME,
                phase: 'event',
                detail: toExecutionTestReportValue(report),
                ...(artifact.sourceTrace
                  ? { sourceTrace: artifact.sourceTrace }
                  : {}),
              },
            },
          });
          if (appended === 'budget-exceeded') {
            await options.client.transition({
              executionId,
              workerId: options.workerId,
              leaseToken,
              status: 'failed',
              reason: 'event-budget-exceeded',
            });
            return true;
          }
          if (appended === 'rejected') {
            abort.abort('lease-lost');
            return true;
          }
        }
        const emittedAt = now();
        const descriptor = Object.freeze({
          artifactId: artifact.artifactId,
          kind: artifact.kind,
          ...(artifact.label ? { label: artifact.label } : {}),
          mediaType: artifact.mediaType,
          size: artifact.contents.byteLength,
          digest: `sha256-${createHash('sha256')
            .update(artifact.contents)
            .digest('hex')}`,
          expiresAt: emittedAt + artifactRetentionMs,
          authorizationScope: `execution:${executionId}`,
          ...(artifact.sourceTrace
            ? { sourceTrace: artifact.sourceTrace }
            : {}),
          ...(artifact.metadata ? { metadata: artifact.metadata } : {}),
        });
        const uploaded = await options.client.uploadArtifact({
          executionId,
          workerId: options.workerId,
          leaseToken,
          workerEventId: `${claim.lease.attempt}:artifact:${index}:${artifact.artifactId}`,
          descriptor,
          contents: artifact.contents,
        });
        if (uploaded === 'budget-exceeded') {
          await options.client.transition({
            executionId,
            workerId: options.workerId,
            leaseToken,
            status: 'failed',
            reason: 'artifact-budget-exceeded',
          });
          return true;
        }
        if (uploaded === 'rejected') {
          abort.abort('artifact-rejected');
          return true;
        }
      }
      await options.client.transition({
        executionId,
        workerId: options.workerId,
        leaseToken,
        status: terminalStatus(result.status),
        ...(result.reason === undefined ? {} : { reason: result.reason }),
      });
      return true;
    } finally {
      clearInterval(heartbeat);
      if (heartbeatFailure) {
        // The lease is already treated as lost; never retry a terminal mutation.
      }
    }
  };

  return Object.freeze({ pollOnce });
};
