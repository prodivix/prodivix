import {
  createExecutionJobController,
  createExecutionNetworkTrace,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  createExecutionSessionCoordinator,
  EXECUTION_DATA_GATEWAY_BRIDGE_REQUEST_TYPE,
  type ExecutionDataGatewayBridgeRequest,
  type ExecutionDataGatewayResult,
} from '@prodivix/runtime-core';
import { describe, expect, it, vi } from 'vitest';
import { createRemoteDataGatewayRunCoordinator } from './remoteDataGatewayRunCoordinator';

const descriptor = createExecutionProviderDescriptor({
  id: 'prodivix.remote.preview.test',
  version: '1',
  isolation: 'remote-isolated',
  profiles: ['preview'],
  runtimeZones: ['client'],
  invocationKinds: ['workspace'],
});

const request: ExecutionDataGatewayBridgeRequest = Object.freeze({
  type: EXECUTION_DATA_GATEWAY_BRIDGE_REQUEST_TYPE,
  requestId: 'invocation-1:1',
  documentId: 'data-products',
  operationId: 'list-products',
  invocationId: 'invocation-1',
  sequence: 2,
  attempt: 1,
  input: Object.freeze({ page: 1 }),
});

const createResult = (status = 200): ExecutionDataGatewayResult =>
  Object.freeze({
    value: Object.freeze({ items: Object.freeze([]) }),
    empty: false,
    network: createExecutionNetworkTrace({
      requestId: request.requestId,
      phase: 'runtime',
      runtimeZone: 'server',
      mode: 'live',
      adapter: 'core.http',
      method: 'GET',
      sanitizedUrl: 'https://api.example.test/',
      protocol: 'https',
      startedAt: 100,
      completedAt: 120,
      outcome: 'allowed',
      status,
      correlation: {
        kind: 'data-operation',
        documentId: request.documentId,
        operationId: request.operationId,
        invocationId: request.invocationId,
        sequence: request.sequence,
        attempt: request.attempt,
      },
    }),
  });

const createTerminalSession = () => {
  const job = createExecutionJobController({
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
    }),
  });
  job.markStarting();
  job.markRunning();
  job.succeed();
  const sessions = createExecutionSessionCoordinator();
  sessions.activate({ sessionId: 'project-preview', job: job.job });
  return { job: job.job, sessions };
};

describe('Remote Data gateway run coordinator', () => {
  it('publishes exact and duplicate results into a terminal Preview Session', async () => {
    const { job, sessions } = createTerminalSession();
    const invoke = vi.fn(async () => createResult());
    const runs = createRemoteDataGatewayRunCoordinator({
      publishTrace: (input) => sessions.publishTrace(input),
    });
    runs.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId: 'project-preview',
      invoke,
    });

    await expect(runs.execute(request)).resolves.toMatchObject({ ok: true });
    await expect(runs.execute(request)).resolves.toMatchObject({ ok: true });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(sessions.getSnapshot('project-preview')?.observations).toHaveLength(
      1
    );
    expect(job.getSnapshot()).toMatchObject({ status: 'succeeded' });
  });

  it('drops an in-flight result after generation replacement or deactivation', async () => {
    const { job, sessions } = createTerminalSession();
    let resolveResult: (result: ExecutionDataGatewayResult) => void = () =>
      undefined;
    const delayed = new Promise<ExecutionDataGatewayResult>((resolve) => {
      resolveResult = resolve;
    });
    const runs = createRemoteDataGatewayRunCoordinator({
      publishTrace: (input) => sessions.publishTrace(input),
    });
    runs.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId: 'project-preview',
      invoke: async () => delayed,
    });
    const response = runs.execute(request);
    runs.activate({
      executionId: 'execution-2',
      jobId: 'execution-2',
      sessionId: 'project-preview',
      invoke: async () => createResult(),
    });
    resolveResult(createResult());

    await expect(response).resolves.toMatchObject({
      ok: false,
      error: { code: 'DATA_REMOTE_GATEWAY_STALE', retryable: false },
    });
    expect(sessions.getSnapshot('project-preview')?.observations).toEqual([]);
    expect(runs.deactivate('execution-1')).toBe(false);
    expect(runs.deactivate('execution-2')).toBe(true);

    let resolveStopped: (result: ExecutionDataGatewayResult) => void = () =>
      undefined;
    const stopped = new Promise<ExecutionDataGatewayResult>((resolve) => {
      resolveStopped = resolve;
    });
    runs.activate({
      executionId: 'execution-3',
      jobId: job.id,
      sessionId: 'project-preview',
      invoke: async () => stopped,
    });
    const stoppedResponse = runs.execute(request);
    expect(runs.deactivate(job.id)).toBe(true);
    resolveStopped(createResult());
    await expect(stoppedResponse).resolves.toMatchObject({
      ok: false,
      error: { code: 'DATA_REMOTE_GATEWAY_STALE', retryable: false },
    });
    expect(sessions.getSnapshot('project-preview')?.observations).toEqual([]);
  });

  it('fails closed on a conflicting replay without exposing arbitrary errors', async () => {
    const { job, sessions } = createTerminalSession();
    const results = [createResult(200), createResult(201)];
    const runs = createRemoteDataGatewayRunCoordinator({
      publishTrace: (input) => sessions.publishTrace(input),
    });
    runs.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId: 'project-preview',
      invoke: async () => results.shift()!,
    });
    await expect(runs.execute(request)).resolves.toMatchObject({ ok: true });
    await expect(runs.execute(request)).resolves.toMatchObject({
      ok: false,
      error: { code: 'DATA_REMOTE_GATEWAY_INVALID', retryable: false },
    });

    const canary = 'secret-canary-run-coordinator-91c2';
    runs.activate({
      executionId: job.id,
      jobId: job.id,
      sessionId: 'project-preview',
      invoke: async () => {
        throw Object.freeze({
          code: 'SECRET_CANARY_COORDINATOR_ERROR',
          message: canary,
          retryable: false,
        });
      },
    });
    const failure = await runs.execute(request);
    expect(failure).toMatchObject({
      ok: false,
      error: { code: 'DATA_REMOTE_GATEWAY_UNAVAILABLE' },
    });
    expect(JSON.stringify(failure)).not.toContain(canary);
  });
});
