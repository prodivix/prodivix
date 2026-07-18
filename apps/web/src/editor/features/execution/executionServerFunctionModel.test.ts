import {
  createExecutionJobController,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  createExecutionSessionCoordinator,
  type ExecutionValue,
} from '@prodivix/runtime-core';
import {
  createServerFunctionInvocationTrace,
  EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  SERVER_FUNCTION_INVOCATION_TRACE_NAME,
  toExecutionServerFunctionBridgeFailure,
  toExecutionServerFunctionBridgeSuccess,
  toServerFunctionInvocationTraceValue,
} from '@prodivix/server-runtime';
import { describe, expect, it } from 'vitest';
import {
  createExecutionServerFunctionEntries,
  resolveExecutionServerFunctionPrimarySourceTrace,
} from './executionServerFunctionModel';

const descriptor = createExecutionProviderDescriptor({
  id: 'prodivix.remote.preview.server-model.test',
  version: '1',
  isolation: 'remote-isolated',
  profiles: ['preview'],
  runtimeZones: ['client'],
  invocationKinds: ['workspace'],
  capabilities: ['server-function'],
});

const request = Object.freeze({
  type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  requestId: 'invocation-model:1',
  invocationId: 'invocation-model',
  attempt: 1,
  functionRef: Object.freeze({
    artifactId: 'code-auth',
    exportName: 'requireOwner',
  }),
  input: Object.freeze({ cookie: 'credential-canary-input' }),
});

const traceRecord = (
  spanId: string,
  detail: ReturnType<typeof toServerFunctionInvocationTraceValue>
) => ({
  traceId: 'server-function:job-server-model',
  spanId,
  name: SERVER_FUNCTION_INVOCATION_TRACE_NAME,
  phase: 'event' as const,
  detail,
  sourceTrace: [
    {
      sourceRef: { kind: 'code-artifact' as const, artifactId: 'code-auth' },
      label: 'code-auth#requireOwner',
    },
  ],
});

describe('Execution Server Function model', () => {
  it('merges Job and Session observations chronologically and drops malformed private payloads', () => {
    const controller = createExecutionJobController({
      jobId: 'job-server-model',
      provider: descriptor,
      request: createExecutionRequest({
        requestId: 'preview-server-model',
        profile: 'preview',
        runtimeZone: 'client',
        workspace: { workspaceId: 'workspace', snapshotId: 'snapshot-exact' },
        invocation: {
          kind: 'workspace',
          targetRef: { kind: 'workspace', workspaceId: 'workspace' },
        },
        requiredCapabilities: ['server-function'],
      }),
    });
    const sessions = createExecutionSessionCoordinator();
    sessions.activate({ sessionId: 'project-preview', job: controller.job });
    controller.markRunning();
    const jobTrace = createServerFunctionInvocationTrace({
      request,
      response: toExecutionServerFunctionBridgeFailure(
        request.requestId,
        'SVR-4004'
      ),
      startedAt: 20,
      completedAt: 30,
    });
    controller.emitTrace(
      traceRecord(
        'invocation-model:job',
        toServerFunctionInvocationTraceValue(jobTrace)
      )
    );
    controller.succeed();

    const observationTrace = createServerFunctionInvocationTrace({
      request,
      response: toExecutionServerFunctionBridgeSuccess(request.requestId, {
        kind: 'allow',
      }),
      startedAt: 10,
      completedAt: 15,
    });
    sessions.publishTrace({
      sessionId: 'project-preview',
      jobId: controller.job.id,
      observedAt: 15,
      trace: traceRecord(
        'invocation-model:observation',
        toServerFunctionInvocationTraceValue(observationTrace)
      ),
    });
    sessions.publishTrace({
      sessionId: 'project-preview',
      jobId: controller.job.id,
      observedAt: 31,
      trace: {
        traceId: 'server-function:malformed',
        spanId: 'invocation-model:malformed',
        name: SERVER_FUNCTION_INVOCATION_TRACE_NAME,
        phase: 'event',
        detail: {
          ...(toServerFunctionInvocationTraceValue(
            observationTrace
          ) as Readonly<Record<string, ExecutionValue>>),
          sessionToken: 'credential-canary-private',
        },
      },
    });

    const entries = createExecutionServerFunctionEntries(
      sessions.getSnapshot('project-preview')
    );
    expect(entries.map(({ trace }) => trace.completedAt)).toEqual([15, 30]);
    expect(entries[0]).toMatchObject({
      jobId: controller.job.id,
      providerId: descriptor.id,
      snapshotId: 'snapshot-exact',
      trace: { outcome: 'succeeded', resultKind: 'allow' },
      sourceTrace: [
        {
          sourceRef: { kind: 'code-artifact', artifactId: 'code-auth' },
          label: 'code-auth#requireOwner',
        },
      ],
      primarySourceTrace: {
        sourceRef: { kind: 'code-artifact', artifactId: 'code-auth' },
        label: 'code-auth#requireOwner',
      },
    });
    expect(entries[1]?.trace).toMatchObject({
      outcome: 'failed',
      errorCode: 'SVR-4004',
    });
    expect(JSON.stringify(entries)).not.toMatch(
      /credential-canary|cookie|sessionToken/iu
    );
  });

  it('requires one exact function-owned CodeArtifact trace before navigation', () => {
    const trace = createServerFunctionInvocationTrace({
      request,
      response: toExecutionServerFunctionBridgeSuccess(request.requestId, {
        kind: 'allow',
      }),
      startedAt: 1,
      completedAt: 2,
    });
    const exact = Object.freeze({
      sourceRef: Object.freeze({
        kind: 'code-artifact' as const,
        artifactId: 'code-auth',
      }),
    });
    expect(
      resolveExecutionServerFunctionPrimarySourceTrace(trace, [exact])
    ).toBe(exact);
    expect(
      resolveExecutionServerFunctionPrimarySourceTrace(trace, [exact, exact])
    ).toBeUndefined();
    expect(
      resolveExecutionServerFunctionPrimarySourceTrace(trace, [
        {
          sourceRef: { kind: 'code-artifact', artifactId: 'code-helper' },
        },
      ])
    ).toBeUndefined();
    expect(
      resolveExecutionServerFunctionPrimarySourceTrace(trace, [
        {
          sourceRef: exact.sourceRef,
          sourceSpan: {
            artifactId: 'code-helper',
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 2,
          },
        },
      ])
    ).toBeUndefined();
  });
});
