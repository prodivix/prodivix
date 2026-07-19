import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  createExecutionNetworkTrace,
  createExecutionSecretLeakDiagnostic,
  createExecutionSecretLeakGuard,
  EXECUTION_SECRET_LEAK_REASON,
  EXECUTION_NETWORK_TRACE_NAME,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_TRACE_NAME,
  readExecutionTestReportValue,
  toExecutionNetworkTraceValue,
  toExecutionTestReportValue,
  type ExecutionSecretLeakGuard,
  type ExecutionSecretLeakSurface,
  type ExecutionJobStatus,
} from '@prodivix/runtime-core';
import {
  createServerFunctionInvocationTrace,
  ISOLATED_SERVER_FUNCTION_AUTHORITY_FORMAT,
  ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE,
  readIsolatedServerFunctionAuthority,
  readIsolatedServerFunctionExecutionContext,
  readIsolatedServerFunctionPlan,
  readServerFunctionInvocationTraceValue,
  SERVER_FUNCTION_INVOCATION_TRACE_NAME,
  toServerFunctionInvocationTraceValue,
} from '@prodivix/server-runtime';
import { readRemoteWorkerServerFunctionArtifact } from './serverFunctionArtifact';
import { readRemoteWorkerProjectSourceMutationArtifact } from './projectSourceMutationArtifact';
import { createRemoteWorkerSecretRecipient } from './remoteWorkerSecretRecipient';
import type {
  RemoteWorkerControlPlaneClient,
  RemoteWorkerSandbox,
  RemoteWorkerSandboxResult,
  RemoteWorkerTerminalCoordinator,
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
  terminal?: RemoteWorkerTerminalCoordinator;
}>;

const profiles = new Set(['preview', 'test', 'build', 'production']);

const terminalStatus = (
  status: 'succeeded' | 'failed' | 'timed-out' | 'cancelled'
): ExecutionJobStatus => status;

const inspectSandboxResult = (
  guard: ExecutionSecretLeakGuard,
  result: RemoteWorkerSandboxResult
): ExecutionSecretLeakSurface | undefined => {
  if (result.secretLeakDetected) return 'log';
  if (
    !guard.inspectValue('log', { stdout: result.stdout, stderr: result.stderr })
      .safe
  )
    return 'log';
  if (!guard.inspectValue('crash', { reason: result.reason }).safe)
    return 'crash';
  if (!guard.inspectValue('trace', result.networkTraces ?? []).safe)
    return 'trace';
  if (!guard.inspectValue('trace', result.serverFunctionTraces ?? []).safe)
    return 'trace';
  for (const artifact of result.artifacts ?? []) {
    const surface =
      artifact.mediaType === EXECUTION_TEST_REPORT_MEDIA_TYPE
        ? ('test-report' as const)
        : ('artifact-content' as const);
    const { contents, ...descriptor } = artifact;
    if (!guard.inspectValue('artifact-descriptor', descriptor).safe)
      return 'artifact-descriptor';
    if (!guard.inspectBytes(surface, contents).safe) return surface;
  }
  return undefined;
};

const blockSecretLeak = async (
  client: RemoteWorkerControlPlaneClient,
  input: Readonly<{
    executionId: string;
    workerId: string;
    leaseToken: string;
    workerEventId: string;
    surface: ExecutionSecretLeakSurface;
  }>
): Promise<void> => {
  const appended = await client.appendEvent({
    executionId: input.executionId,
    workerId: input.workerId,
    leaseToken: input.leaseToken,
    workerEventId: input.workerEventId,
    event: {
      kind: 'diagnostic',
      diagnostic: createExecutionSecretLeakDiagnostic({
        surface: input.surface,
      }),
    },
  });
  if (appended === 'rejected') return;
  await client.transition({
    executionId: input.executionId,
    workerId: input.workerId,
    leaseToken: input.leaseToken,
    status: 'failed',
    reason: EXECUTION_SECRET_LEAK_REASON,
  });
};

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
    let resolvedSecretFields: Record<string, string> | undefined;
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
      if (
        (claim.execution.record.status === 'running' ||
          claim.execution.record.status === 'cancelling') &&
        claim.lease.attempt <= 1
      ) {
        await options.client.transition({
          executionId,
          workerId: options.workerId,
          leaseToken,
          status: 'failed',
          reason: 'invalid-recovery-state',
        });
        return true;
      }
      if (claim.execution.record.status === 'cancelling') {
        await options.client.transition({
          executionId,
          workerId: options.workerId,
          leaseToken,
          status: 'cancelled',
          reason: 'cancellation-requested',
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
      const claimedAuthority = claim.authority;
      const authorityProjection =
        claimedAuthority &&
        claimedAuthority.executionId === executionId &&
        claimedAuthority.workerId === options.workerId &&
        claimedAuthority.workerAttempt === claim.lease.attempt &&
        claimedAuthority.workspaceId === snapshot.workspace.workspaceId &&
        claimedAuthority.snapshotId === snapshot.workspace.snapshotId &&
        claimedAuthority.expiresAt > now()
          ? readIsolatedServerFunctionAuthority({
              format: ISOLATED_SERVER_FUNCTION_AUTHORITY_FORMAT,
              workspaceId: claimedAuthority.workspaceId,
              snapshotId: claimedAuthority.snapshotId,
              principal: claimedAuthority.principal,
              permissions: claimedAuthority.permissions,
              expiresAt: claimedAuthority.expiresAt,
            })
          : undefined;
      const serverFunctionExecution =
        profile === 'production'
          ? readIsolatedServerFunctionExecutionContext(
              claim.execution.request,
              snapshot.serverFunctionPlan,
              authorityProjection,
              now()
            )
          : undefined;
      if (profile === 'production' && !serverFunctionExecution) {
        await options.client.transition({
          executionId,
          workerId: options.workerId,
          leaseToken,
          status: 'failed',
          reason: 'invalid-server-function-request',
        });
        return true;
      }
      const isolatedPlan =
        profile === 'production'
          ? readIsolatedServerFunctionPlan(snapshot.serverFunctionPlan)
          : undefined;
      let serverFunctionSecrets;
      const secretPolicy = isolatedPlan?.definition.environment;
      if (secretPolicy) {
        const recipient = createRemoteWorkerSecretRecipient();
        try {
          const envelope = options.client.resolveServerFunctionSecrets
            ? await options.client.resolveServerFunctionSecrets({
                executionId,
                workerId: options.workerId,
                leaseToken,
                recipientPublicKey: recipient.publicKey,
              })
            : undefined;
          serverFunctionSecrets = envelope
            ? recipient.open(envelope, {
                executionId,
                workerId: options.workerId,
                workerAttempt: claim.lease.attempt,
                workspaceId: snapshot.workspace.workspaceId,
                snapshotId: snapshot.workspace.snapshotId,
                functionRef: isolatedPlan.definition.reference,
                invocationId: serverFunctionExecution!.invocation.invocationId,
                fields: Object.keys(secretPolicy.secretsByField),
                now: now(),
              })
            : undefined;
        } catch {
          serverFunctionSecrets = undefined;
        }
        if (!serverFunctionSecrets) {
          await options.client.transition({
            executionId,
            workerId: options.workerId,
            leaseToken,
            status: 'failed',
            reason: 'secret-resolution-denied',
          });
          return true;
        }
        resolvedSecretFields = serverFunctionSecrets.fields as Record<
          string,
          string
        >;
      }
      const running =
        claim.execution.record.status === 'running'
          ? true
          : await options.client.transition({
              executionId,
              workerId: options.workerId,
              leaseToken,
              status: 'running',
            });
      if (!running) {
        abort.abort('lease-lost');
        return true;
      }
      const serverFunctionStartedAt =
        profile === 'production'
          ? (claim.execution.record.startedAt ??
            claim.execution.record.createdAt)
          : undefined;
      const executionRedactValues = Object.freeze([
        ...(options.redactValues ?? []),
        leaseToken,
        ...Object.values(serverFunctionSecrets?.fields ?? {}),
      ]);
      const terminal =
        options.terminal &&
        claim.execution.record.provider.capabilities.includes('terminal')
          ? options.terminal
          : undefined;
      const result = await options.sandbox.execute({
        executionId,
        snapshot,
        profile: profile as 'preview' | 'test' | 'build' | 'production',
        request: claim.execution.request,
        ...(serverFunctionExecution?.authority
          ? { serverFunctionAuthority: serverFunctionExecution.authority }
          : {}),
        ...(serverFunctionSecrets ? { serverFunctionSecrets } : {}),
        timeoutMs:
          claim.execution.request.timeoutMs ??
          snapshot.resourceHints.timeoutMs ??
          options.defaultTimeoutMs,
        maximumOutputBytes:
          snapshot.resourceHints.maxOutputBytes ??
          options.defaultMaximumOutputBytes,
        redactValues: executionRedactValues,
        signal: abort.signal,
        ...(terminal
          ? {
              terminal: Object.freeze({
                connect: (process) =>
                  terminal.connect({
                    executionId,
                    workerId: options.workerId,
                    leaseToken,
                    workerAttempt: claim.lease.attempt,
                    process,
                    signal: abort.signal,
                    redactValues: executionRedactValues,
                  }),
              }),
            }
          : {}),
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
      const outputGuard = createExecutionSecretLeakGuard({
        secretValues: executionRedactValues,
      });
      const secretLeakSurface = inspectSandboxResult(outputGuard, result);
      if (secretLeakSurface) {
        await blockSecretLeak(options.client, {
          executionId,
          workerId: options.workerId,
          leaseToken,
          workerEventId: `${claim.lease.attempt}:security:secret-leak`,
          surface: secretLeakSurface,
        });
        return true;
      }
      let serverFunctionTraceProjection:
        | Readonly<{
            artifact: NonNullable<
              RemoteWorkerSandboxResult['artifacts']
            >[number];
            detail: ReturnType<typeof toServerFunctionInvocationTraceValue>;
            sourceTrace: NonNullable<
              NonNullable<
                RemoteWorkerSandboxResult['artifacts']
              >[number]['sourceTrace']
            >;
          }>
        | undefined;
      if (profile === 'production') {
        const resultArtifacts = (result.artifacts ?? []).filter(
          ({ mediaType }) =>
            mediaType === ISOLATED_SERVER_FUNCTION_RESULT_MEDIA_TYPE
        );
        const artifact = resultArtifacts[0];
        const projection =
          artifact && serverFunctionExecution
            ? readRemoteWorkerServerFunctionArtifact({
                snapshot,
                request: claim.execution.request,
                artifact,
              })
            : undefined;
        if (
          resultArtifacts.length !== 1 ||
          !artifact ||
          !serverFunctionExecution ||
          !projection ||
          serverFunctionStartedAt === undefined
        ) {
          await options.client.transition({
            executionId,
            workerId: options.workerId,
            leaseToken,
            status: 'failed',
            reason: 'invalid-server-function-result',
          });
          return true;
        }
        const completedAt = Math.max(serverFunctionStartedAt, now());
        serverFunctionTraceProjection = Object.freeze({
          artifact,
          detail: toServerFunctionInvocationTraceValue(
            createServerFunctionInvocationTrace({
              request: serverFunctionExecution.invocation,
              response: projection.response,
              startedAt: serverFunctionStartedAt,
              completedAt,
            })
          ),
          sourceTrace: projection.sourceTrace,
        });
        if (
          isolatedPlan &&
          isolatedPlan.definition.effect === 'mutation' &&
          !readRemoteWorkerProjectSourceMutationArtifact({
            snapshot,
            response: projection.response,
            artifacts: result.artifacts ?? [],
          })
        ) {
          await options.client.transition({
            executionId,
            workerId: options.workerId,
            leaseToken,
            status: 'failed',
            reason: 'invalid-project-source-mutation',
          });
          return true;
        }
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
              category: 'process',
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
              category: 'system',
              message:
                'Remote execution output exceeded its configured budget and was truncated.',
              redacted: true,
              truncated: true,
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
      let canonicalTestReportPublished = false;
      for (const [index, artifact] of (result.artifacts ?? []).entries()) {
        let canonicalTestReport: ReturnType<
          typeof readExecutionTestReportValue
        >;
        if (artifact.mediaType === EXECUTION_TEST_REPORT_MEDIA_TYPE) {
          try {
            canonicalTestReport = readExecutionTestReportValue(
              JSON.parse(
                Buffer.from(artifact.contents).toString('utf8')
              ) as unknown
            );
          } catch {
            canonicalTestReport = undefined;
          }
          const expectedReportId = `test-report:${executionId}`;
          if (
            claim.execution.request.profile !== 'test' ||
            !canonicalTestReport ||
            canonicalTestReport.reportId !== expectedReportId ||
            artifact.artifactId !== expectedReportId ||
            artifact.kind !== 'report' ||
            artifact.metadata?.reportId !== expectedReportId ||
            artifact.metadata?.snapshotDigest !== snapshot.contentDigest ||
            artifact.metadata?.status !== canonicalTestReport.status ||
            !artifact.sourceTrace?.length
          ) {
            await options.client.transition({
              executionId,
              workerId: options.workerId,
              leaseToken,
              status: 'failed',
              reason: 'invalid-test-report',
            });
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
        if (canonicalTestReport) {
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
                detail: toExecutionTestReportValue(canonicalTestReport),
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
          canonicalTestReportPublished = true;
        }
        if (serverFunctionTraceProjection?.artifact === artifact) {
          const appended = await options.client.appendEvent({
            executionId,
            workerId: options.workerId,
            leaseToken,
            workerEventId: `${claim.lease.attempt}:server-function:trace`,
            event: {
              kind: 'trace',
              trace: {
                traceId: `server-function:${executionId}`,
                spanId: serverFunctionExecution!.invocation.requestId,
                name: SERVER_FUNCTION_INVOCATION_TRACE_NAME,
                phase: 'event',
                detail: serverFunctionTraceProjection.detail,
                sourceTrace: serverFunctionTraceProjection.sourceTrace,
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
      }
      if (result.serverFunctionTraces?.length) {
        if (
          claim.execution.request.profile !== 'test' ||
          !claim.execution.request.requiredCapabilities.includes(
            'server-function'
          ) ||
          !claim.execution.record.provider.capabilities.includes(
            'server-function'
          ) ||
          !snapshot.capabilityRequirements.test.includes('server-function') ||
          !snapshot.serverRuntimeMockProvision ||
          !canonicalTestReportPublished ||
          result.serverFunctionTraces.length > 10_000
        ) {
          await options.client.transition({
            executionId,
            workerId: options.workerId,
            leaseToken,
            status: 'failed',
            reason: 'invalid-server-function-test-trace',
          });
          return true;
        }
        for (const [
          index,
          candidate,
        ] of result.serverFunctionTraces.entries()) {
          const trace = readServerFunctionInvocationTraceValue(candidate.trace);
          if (!trace) {
            await options.client.transition({
              executionId,
              workerId: options.workerId,
              leaseToken,
              status: 'failed',
              reason: 'invalid-server-function-test-trace',
            });
            return true;
          }
          const detail = toServerFunctionInvocationTraceValue(trace);
          const trustedSourceTraces = snapshot.files.flatMap(
            (file) => file.sourceTrace ?? []
          );
          const exactRootCount = candidate.sourceTrace.filter(
            (source) =>
              source.sourceRef.kind === 'code-artifact' &&
              source.sourceRef.artifactId === trace.functionRef.artifactId &&
              (!source.sourceSpan ||
                source.sourceSpan.artifactId === trace.functionRef.artifactId)
          ).length;
          if (
            !candidate.sourceTrace.length ||
            candidate.sourceTrace.length > 128 ||
            exactRootCount !== 1 ||
            candidate.sourceTrace.some(
              (source) =>
                !trustedSourceTraces.some((trusted) =>
                  isDeepStrictEqual(source, trusted)
                )
            )
          ) {
            await options.client.transition({
              executionId,
              workerId: options.workerId,
              leaseToken,
              status: 'failed',
              reason: 'invalid-server-function-test-trace',
            });
            return true;
          }
          const appended = await options.client.appendEvent({
            executionId,
            workerId: options.workerId,
            leaseToken,
            workerEventId: `${claim.lease.attempt}:server-function-test:trace:${index}`,
            event: {
              kind: 'trace',
              trace: {
                traceId: `server-function-test:${executionId}`,
                spanId: `${trace.requestId}:${index}`,
                name: SERVER_FUNCTION_INVOCATION_TRACE_NAME,
                phase: 'event',
                detail,
                sourceTrace: candidate.sourceTrace,
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
      }
      await options.client.transition({
        executionId,
        workerId: options.workerId,
        leaseToken,
        status: terminalStatus(result.status),
        ...(result.reason !== undefined
          ? { reason: result.reason }
          : result.status === 'failed' &&
              result.networkTraces?.some(
                (network) => network.outcome === 'denied'
              )
            ? { reason: 'network-policy-denied' }
            : {}),
      });
      return true;
    } finally {
      clearInterval(heartbeat);
      if (resolvedSecretFields)
        Object.keys(resolvedSecretFields).forEach((field) => {
          resolvedSecretFields![field] = '';
        });
      if (heartbeatFailure) {
        // The lease is already treated as lost; never retry a terminal mutation.
      }
    }
  };

  return Object.freeze({ pollOnce });
};
