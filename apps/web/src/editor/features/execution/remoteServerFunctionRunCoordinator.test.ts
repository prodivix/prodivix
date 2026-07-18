import {
  createExecutionJobController,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  createExecutionSessionCoordinator,
} from '@prodivix/runtime-core';
import {
  EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  readServerFunctionInvocationTraceValue,
  toExecutionServerFunctionBridgeSuccess,
} from '@prodivix/server-runtime';
import { describe, expect, it, vi } from 'vitest';
import { createRemoteServerFunctionRunCoordinator } from './remoteServerFunctionRunCoordinator';

const descriptor = createExecutionProviderDescriptor({
  id: 'prodivix.remote.preview.server-function.test',
  version: '1',
  isolation: 'remote-isolated',
  profiles: ['preview'],
  runtimeZones: ['client'],
  invocationKinds: ['workspace'],
  capabilities: ['server-function'],
});

const inputCredentialCanary = 'input-credential-canary-91c2';
const outputCredentialCanary = 'output-credential-canary-73a1';
const request = {
  type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  requestId: 'invocation-1:1',
  invocationId: 'invocation-1',
  attempt: 1,
  functionRef: { artifactId: 'code-auth', exportName: 'loadPrincipal' },
  input: { bearer: inputCredentialCanary },
} as const;

const createTerminalSession = () => {
  const controller = createExecutionJobController({
    jobId: 'execution-1',
    provider: descriptor,
    request: createExecutionRequest({
      requestId: 'preview-request-1',
      profile: 'preview',
      runtimeZone: 'client',
      workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-1' },
      invocation: {
        kind: 'workspace',
        targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
      },
      requiredCapabilities: ['server-function'],
    }),
  });
  controller.markStarting();
  controller.markRunning();
  controller.succeed();
  const sessions = createExecutionSessionCoordinator();
  sessions.activate({ sessionId: 'project-preview', job: controller.job });
  return { job: controller.job, sessions };
};

const deterministicClock = (...times: number[]) => {
  const values = [...times];
  return () => values.shift() ?? times.at(-1) ?? 0;
};

describe('Remote Server Function run coordinator', () => {
  it('publishes sanitized metadata into the exact terminal Preview Session', async () => {
    const { job, sessions } = createTerminalSession();
    const runs = createRemoteServerFunctionRunCoordinator({
      publishTrace: (input) => sessions.publishTrace(input),
      now: deterministicClock(100, 112),
    });
    runs.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId: 'project-preview',
      invoke: async () =>
        toExecutionServerFunctionBridgeSuccess(request.requestId, {
          kind: 'value',
          value: { token: outputCredentialCanary },
        }),
    });

    await expect(runs.execute(request)).resolves.toMatchObject({ ok: true });
    const snapshot = sessions.getSnapshot('project-preview');
    expect(snapshot?.status).toBe('succeeded');
    expect(job.getSnapshot()).toMatchObject({ status: 'succeeded' });
    expect(snapshot?.observations).toHaveLength(1);
    const observation = snapshot!.observations[0]!;
    expect(observation).toMatchObject({
      sessionId: 'project-preview',
      jobId: job.id,
      requestId: 'preview-request-1',
      providerId: descriptor.id,
      workspaceId: 'workspace-1',
      snapshotId: 'snapshot-1',
      observedAt: 112,
      trace: {
        traceId: `server-function:${job.id}`,
        spanId: request.requestId,
        name: 'server.function',
        phase: 'event',
        sourceTrace: [
          {
            sourceRef: { kind: 'code-artifact', artifactId: 'code-auth' },
            label: 'code-auth#loadPrincipal',
          },
        ],
      },
    });
    expect(
      readServerFunctionInvocationTraceValue(observation.trace.detail)
    ).toEqual({
      format: 'prodivix.server-function-invocation-trace.v1',
      requestId: request.requestId,
      invocationId: request.invocationId,
      attempt: 1,
      functionRef: request.functionRef,
      startedAt: 100,
      completedAt: 112,
      durationMs: 12,
      outcome: 'succeeded',
      resultKind: 'value',
      redacted: true,
    });
    expect(JSON.stringify(observation)).not.toMatch(
      new RegExp(
        `${inputCredentialCanary}|${outputCredentialCanary}|bearer|token`,
        'iu'
      )
    );
  });

  it('rejects a response after the active generation is replaced without publishing it', async () => {
    const { job, sessions } = createTerminalSession();
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const publishTrace = vi.fn((input) => sessions.publishTrace(input));
    const runs = createRemoteServerFunctionRunCoordinator({
      publishTrace,
      now: deterministicClock(200, 201),
    });
    runs.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId: 'project-preview',
      invoke: async () => {
        await pending;
        return toExecutionServerFunctionBridgeSuccess(request.requestId, {
          kind: 'allow',
        });
      },
    });
    const result = runs.execute(request);
    runs.activate({
      executionId: 'execution-2',
      jobId: 'execution-2',
      sessionId: 'project-preview',
      invoke: async () =>
        toExecutionServerFunctionBridgeSuccess(request.requestId, {
          kind: 'allow',
        }),
    });
    release?.();

    await expect(result).resolves.toMatchObject({
      ok: false,
      error: { code: 'SVR_REMOTE_GATEWAY_STALE' },
    });
    expect(publishTrace).not.toHaveBeenCalled();
    expect(sessions.getSnapshot('project-preview')?.observations).toEqual([]);
  });

  it('traces exact cancellation while rejecting mismatched cancellation', async () => {
    const { job, sessions } = createTerminalSession();
    const runs = createRemoteServerFunctionRunCoordinator({
      publishTrace: (input) => sessions.publishTrace(input),
      now: deterministicClock(300, 305),
    });
    let observedSignal: AbortSignal | undefined;
    runs.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId: 'project-preview',
      invoke: async (_executionId, _request, signal) => {
        observedSignal = signal;
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('cancelled', 'AbortError')),
            { once: true }
          );
        });
        throw new Error('unreachable');
      },
    });
    const result = runs.execute(request);
    expect(
      runs.cancel({
        type: 'prodivix.execution-server-function-gateway-cancel.v1',
        requestId: request.requestId,
        invocationId: 'different-invocation',
      })
    ).toBe(false);
    expect(
      runs.cancel({
        type: 'prodivix.execution-server-function-gateway-cancel.v1',
        requestId: request.requestId,
        invocationId: request.invocationId,
      })
    ).toBe(true);
    expect(observedSignal?.aborted).toBe(true);
    await expect(result).resolves.toMatchObject({
      ok: false,
      error: { code: 'SVR_CANCELLED', retryable: false },
    });
    const observation =
      sessions.getSnapshot('project-preview')?.observations[0];
    expect(
      readServerFunctionInvocationTraceValue(observation?.trace.detail)
    ).toMatchObject({
      outcome: 'cancelled',
      errorCode: 'SVR_CANCELLED',
      retryable: false,
      durationMs: 5,
    });
  });

  it('fails closed when the Session correlation is absent or conflicting', async () => {
    const { job, sessions } = createTerminalSession();
    const success = toExecutionServerFunctionBridgeSuccess(request.requestId, {
      kind: 'allow',
    });
    const missing = createRemoteServerFunctionRunCoordinator({
      publishTrace: (input) => sessions.publishTrace(input),
      now: deterministicClock(400, 401),
    });
    missing.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId: 'missing-session',
      invoke: async () => success,
    });
    await expect(missing.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SVR_REMOTE_GATEWAY_STALE' },
    });

    const conflicting = createRemoteServerFunctionRunCoordinator({
      publishTrace: () => ({ status: 'conflict' }),
      now: deterministicClock(500, 501),
    });
    conflicting.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId: 'project-preview',
      invoke: async () => success,
    });
    await expect(conflicting.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'SVR_REMOTE_GATEWAY_INVALID' },
    });
  });
});
