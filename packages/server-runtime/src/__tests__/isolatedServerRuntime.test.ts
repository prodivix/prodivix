import {
  createExecutionRequest,
  EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
  type ExecutableProjectServerFunctionPlan,
} from '@prodivix/runtime-core';
import { describe, expect, it } from 'vitest';
import {
  EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
  createIsolatedServerFunctionAuthority,
  readIsolatedServerFunctionExecutionContext,
  readIsolatedServerFunctionExecutionRequest,
  readIsolatedServerFunctionExecutionResponse,
  readIsolatedServerFunctionPlan,
} from '../index';

const functionRef = Object.freeze({
  artifactId: 'code-server-greeting',
  exportName: 'getGreeting',
});

const plan: ExecutableProjectServerFunctionPlan = Object.freeze({
  format: EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
  command: Object.freeze({
    command: 'node',
    args: Object.freeze(['src/.prodivix/server-runtime/invoke.mjs']),
  }),
  invocationFilePath: '.prodivix/server-function-invocation.json',
  resultFilePath: '.prodivix/server-function-result.json',
  entrypointFilePath: 'src/.prodivix/server-runtime/invoke.mjs',
  sourceFilePath: 'src/.prodivix/server-runtime/function.mjs',
  functionRef,
  runtimeManifest: Object.freeze({
    schemaVersion: '1.0',
    functionsByExport: Object.freeze({
      getGreeting: Object.freeze({
        kind: 'function',
        runtimeZone: 'server',
        adapterId: 'prodivix.code-export',
        effect: 'read',
        auth: Object.freeze({ kind: 'public' }),
        inputSchema: Object.freeze({
          type: 'object',
          required: Object.freeze(['name']),
          properties: Object.freeze({
            name: Object.freeze({ type: 'string' }),
          }),
          additionalProperties: false,
        }),
        outputSchema: Object.freeze({
          type: 'object',
          required: Object.freeze(['greeting']),
          properties: Object.freeze({
            greeting: Object.freeze({ type: 'string' }),
          }),
          additionalProperties: false,
        }),
      }),
    }),
  }),
});

const request = createExecutionRequest({
  requestId: 'remote-server-function-1',
  profile: 'production',
  runtimeZone: 'server',
  workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-1' },
  invocation: {
    kind: 'code',
    targetRef: {
      kind: 'code-artifact',
      artifactId: functionRef.artifactId,
    },
    entrypoint: functionRef.exportName,
    input: {
      type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
      requestId: 'invocation-1:1',
      invocationId: 'invocation-1',
      attempt: 1,
      functionRef,
      input: { name: 'Ada' },
    },
  },
  requiredCapabilities: ['server-function'],
});

describe('isolated Server Function runtime boundary', () => {
  it('binds one exact production request to its snapshot definition', () => {
    expect(readIsolatedServerFunctionPlan(plan)).toMatchObject({
      definition: {
        reference: functionRef,
        auth: { kind: 'public' },
        effect: 'read',
      },
    });
    expect(readIsolatedServerFunctionExecutionRequest(request, plan)).toEqual(
      request.invocation.input
    );
    expect(
      readIsolatedServerFunctionExecutionRequest(
        Object.freeze({
          ...request,
          invocation: Object.freeze({
            ...request.invocation,
            entrypoint: 'differentExport',
          }),
        }),
        plan
      )
    ).toBeUndefined();
    expect(
      readIsolatedServerFunctionExecutionRequest(
        Object.freeze({ ...request, runtimeZone: 'edge' }),
        plan
      )
    ).toBeUndefined();
  });

  it.each([
    { adapterId: 'custom.backend-eval' },
    { effect: 'mutation' },
    { runtimeZone: 'edge' },
  ])('rejects a hand-crafted snapshot outside the isolated policy', (entry) => {
    const runtimeManifest = plan.runtimeManifest as Readonly<{
      functionsByExport: Readonly<
        Record<string, Readonly<Record<string, unknown>>>
      >;
    }>;
    const candidate = Object.freeze({
      ...plan,
      runtimeManifest: Object.freeze({
        ...runtimeManifest,
        functionsByExport: Object.freeze({
          getGreeting: Object.freeze({
            ...runtimeManifest.functionsByExport.getGreeting,
            ...entry,
          }),
        }),
      }),
    }) as unknown as ExecutableProjectServerFunctionPlan;
    expect(readIsolatedServerFunctionPlan(candidate)).toBeUndefined();
    expect(
      readIsolatedServerFunctionExecutionRequest(request, candidate)
    ).toBeUndefined();
  });

  it('requires an exact unexpired principal projection for authenticated execution', () => {
    const runtimeManifest = plan.runtimeManifest as Readonly<{
      functionsByExport: Readonly<
        Record<string, Readonly<Record<string, unknown>>>
      >;
    }>;
    const authenticatedPlan = Object.freeze({
      ...plan,
      runtimeManifest: Object.freeze({
        ...runtimeManifest,
        functionsByExport: Object.freeze({
          getGreeting: Object.freeze({
            ...runtimeManifest.functionsByExport.getGreeting,
            auth: Object.freeze({ kind: 'authenticated' }),
          }),
        }),
      }),
    }) as unknown as ExecutableProjectServerFunctionPlan;
    expect(readIsolatedServerFunctionPlan(authenticatedPlan)).toMatchObject({
      definition: { auth: { kind: 'authenticated' } },
    });
    expect(
      readIsolatedServerFunctionExecutionContext(
        request,
        authenticatedPlan,
        undefined,
        1_000
      )
    ).toBeUndefined();
    const authority = createIsolatedServerFunctionAuthority({
      workspaceId: request.workspace.workspaceId,
      snapshotId: request.workspace.snapshotId,
      principal: {
        providerId: 'prodivix-product-session',
        principalId: 'user-1',
      },
      permissions: ['workspace.owner'],
      expiresAt: 1_100,
    });
    expect(
      readIsolatedServerFunctionExecutionContext(
        request,
        authenticatedPlan,
        {
          ...authority,
          permissions: ['workspace.write', 'workspace.owner'],
        },
        1_000
      )
    ).toBeUndefined();
    expect(
      readIsolatedServerFunctionExecutionContext(
        request,
        authenticatedPlan,
        { ...authority, expiresAt: 301_001 },
        1_000
      )
    ).toBeUndefined();
    expect(
      readIsolatedServerFunctionExecutionContext(
        request,
        authenticatedPlan,
        authority,
        1_000
      )
    ).toMatchObject({ invocation: request.invocation.input, authority });
    expect(
      readIsolatedServerFunctionExecutionContext(
        request,
        authenticatedPlan,
        { ...authority, expiresAt: 1_000 },
        1_000
      )
    ).toBeUndefined();
    expect(
      readIsolatedServerFunctionExecutionContext(
        request,
        authenticatedPlan,
        { ...authority, sessionId: 'session-must-not-cross' },
        1_000
      )
    ).toBeUndefined();
    expect(
      readIsolatedServerFunctionExecutionContext(
        request,
        plan,
        authority,
        1_000
      )
    ).toEqual({ invocation: request.invocation.input });

    const permissionPlan = Object.freeze({
      ...authenticatedPlan,
      runtimeManifest: Object.freeze({
        ...runtimeManifest,
        functionsByExport: Object.freeze({
          getGreeting: Object.freeze({
            ...runtimeManifest.functionsByExport.getGreeting,
            auth: Object.freeze({
              kind: 'permission',
              permissionId: 'workspace.owner',
            }),
          }),
        }),
      }),
    }) as unknown as ExecutableProjectServerFunctionPlan;
    expect(
      readIsolatedServerFunctionExecutionContext(
        request,
        permissionPlan,
        authority,
        1_000
      )
    ).toMatchObject({ authority: { permissions: ['workspace.owner'] } });
    expect(
      readIsolatedServerFunctionExecutionContext(
        request,
        permissionPlan,
        { ...authority, permissions: [] },
        1_000
      )
    ).toBeUndefined();
    expect(
      readIsolatedServerFunctionPlan({
        ...permissionPlan,
        runtimeManifest: {
          ...(permissionPlan.runtimeManifest as Record<string, unknown>),
          functionsByExport: {
            getGreeting: {
              ...runtimeManifest.functionsByExport.getGreeting,
              auth: { kind: 'permission', permissionId: 'workspace.write' },
            },
          },
        },
      })
    ).toBeUndefined();
  });

  it('revalidates successful output against trusted snapshot schema', () => {
    expect(
      readIsolatedServerFunctionExecutionResponse(
        {
          type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
          requestId: 'invocation-1:1',
          ok: true,
          result: { kind: 'value', value: { greeting: 'Hello Ada' } },
        },
        request,
        plan
      )
    ).toMatchObject({ ok: true, result: { kind: 'value' } });
    expect(
      readIsolatedServerFunctionExecutionResponse(
        {
          type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
          requestId: 'invocation-1:1',
          ok: true,
          result: { kind: 'value', value: { greeting: 42 } },
        },
        request,
        plan
      )
    ).toBeUndefined();
  });

  it('preserves only a correlated, bounded failure response', () => {
    const failure = {
      type: EXECUTION_SERVER_FUNCTION_BRIDGE_RESPONSE_TYPE,
      requestId: 'invocation-1:1',
      ok: false,
      error: { code: 'SVR_ISOLATED_EXECUTION_FAILED', retryable: false },
    } as const;
    expect(
      readIsolatedServerFunctionExecutionResponse(failure, request, plan)
    ).toEqual(failure);
    expect(
      readIsolatedServerFunctionExecutionResponse(
        { ...failure, requestId: 'another-invocation:1' },
        request,
        plan
      )
    ).toBeUndefined();
    expect(
      readIsolatedServerFunctionExecutionResponse(
        { ...failure, error: { code: 'USER_RETRY', retryable: true } },
        request,
        plan
      )
    ).toBeUndefined();
  });
});
