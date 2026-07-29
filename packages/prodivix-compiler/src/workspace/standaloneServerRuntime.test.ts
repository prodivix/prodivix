import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import {
  createWorkspaceStandaloneServerRuntimeModules,
  WORKSPACE_SERVER_RUNTIME_MODULE_ID,
} from '#src/workspace/standaloneServerRuntime';
import {
  EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION,
} from '@prodivix/runtime-core';
import {
  DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
  EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
  type WorkspaceServerRuntimeBinding,
  type WorkspaceServerRuntimeTarget,
} from '#src/workspace/workspaceServerRuntimeTarget';

type RuntimeExports = Readonly<{
  invokeWorkspaceServerFunction(
    functionRef: Readonly<{ artifactId: string; exportName: string }>,
    input: unknown,
    options?: Readonly<{
      invocationId?: string;
      attempt?: number;
      signal?: AbortSignal;
    }>
  ): Promise<unknown>;
}>;

const nodeRequire = createRequire(import.meta.url);

const loadRuntime = (
  options: {
    failPost?: boolean;
    target?: WorkspaceServerRuntimeTarget;
    bindings?: readonly WorkspaceServerRuntimeBinding[];
    provisionModule?: unknown;
    traceHost?: 'browser' | 'node' | 'node-without-builtin-port';
    authSessionResponse?: unknown;
  } = {}
) => {
  const modules = createWorkspaceStandaloneServerRuntimeModules(
    options.target ?? EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
    options.bindings
  );
  const generated = modules.find(
    ({ id }) => id === WORKSPACE_SERVER_RUNTIME_MODULE_ID
  );
  if (!generated) throw new Error('Generated Server runtime module is absent.');
  const listeners = new Set<
    (event: { source: unknown; data: unknown }) => void
  >();
  const posted: unknown[] = [];
  const traceLines: string[] = [];
  const authSessionRequests: Readonly<{
    input: unknown;
    init: unknown;
  }>[] = [];
  const parent = {
    postMessage(value: unknown) {
      if (options.failPost) throw new Error('frame unavailable');
      posted.push(value);
    },
  };
  const runtimeGlobal: Record<string, unknown> = {
    parent,
    addEventListener(
      type: string,
      listener: (event: { source: unknown; data: unknown }) => void
    ) {
      if (type === 'message') listeners.add(listener);
    },
    removeEventListener(
      type: string,
      listener: (event: { source: unknown; data: unknown }) => void
    ) {
      if (type === 'message') listeners.delete(listener);
    },
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    ...(options.traceHost === 'browser'
      ? {}
      : {
          process: {
            versions: { node: '22.0.0' },
            ...(options.traceHost === 'node-without-builtin-port'
              ? {}
              : {
                  getBuiltinModule(id: string) {
                    if (id !== 'node:fs') {
                      throw new Error(`Unexpected builtin module: ${id}`);
                    }
                    return {
                      mkdirSync() {},
                      appendFileSync(_path: string, line: string) {
                        traceLines.push(line);
                      },
                    };
                  },
                }),
          },
        }),
  };
  if (options.traceHost === 'browser') {
    runtimeGlobal.window = runtimeGlobal;
    runtimeGlobal.document = {};
    runtimeGlobal.fetch = async (input: unknown, init: unknown) => {
      authSessionRequests.push(Object.freeze({ input, init }));
      if (options.authSessionResponse === undefined) {
        throw new Error('auth session endpoint unavailable');
      }
      return new Response(JSON.stringify(options.authSessionResponse), {
        status: 200,
        headers: {
          'content-type': EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
        },
      });
    };
  }
  const moduleExports = new Map<string, Record<string, unknown>>();
  const requireGenerated = (id: string) => {
    const generatedExports = moduleExports.get(id);
    if (generatedExports) return generatedExports;
    if (id === './.prodivix/server-runtime-test-provision') {
      return options.provisionModule;
    }
    return nodeRequire(id);
  };
  const evaluateModule = (
    generatedModule: (typeof modules)[number]
  ): Record<string, unknown> => {
    const imports = generatedModule.imports
      .map((intent) => {
        if (intent.kind !== 'named' || !intent.imported || !intent.local) {
          throw new Error(
            `Unsupported generated test import: ${intent.source}`
          );
        }
        return `import { ${intent.imported} as ${intent.local} } from ${JSON.stringify(intent.source)};`;
      })
      .join('\n');
    const transpiled = ts.transpileModule(
      `${imports}\n${generatedModule.body}`,
      {
        fileName: generatedModule.desiredPath ?? generatedModule.suggestedName,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          strict: true,
        },
      }
    ).outputText;
    const exports: Record<string, unknown> = {};
    new Function('exports', 'require', 'globalThis', transpiled)(
      exports,
      requireGenerated,
      runtimeGlobal
    );
    moduleExports.set(generatedModule.id, exports);
    return exports;
  };
  modules
    .filter(({ id }) => id !== WORKSPACE_SERVER_RUNTIME_MODULE_ID)
    .forEach(evaluateModule);
  const exports = evaluateModule(generated);
  return {
    runtime: exports as RuntimeExports,
    posted,
    traceLines,
    authSessionRequests,
    listenerCount: () => listeners.size,
    reply(data: unknown) {
      [...listeners].forEach((listener) => listener({ source: parent, data }));
    },
  };
};

const functionRef = Object.freeze({
  artifactId: 'code-auth',
  exportName: 'loadPrincipal',
});
const remoteInvocation = Object.freeze({
  invocationId: 'remote-invocation-1',
  attempt: 1,
});

describe('standalone Server Function runtime', () => {
  it('uses one bounded value-only request and resolves a strict response', async () => {
    const harness = loadRuntime();
    const invocation = harness.runtime.invokeWorkspaceServerFunction(
      functionRef,
      { routeId: 'route-home' },
      remoteInvocation
    );
    const request = harness.posted[0] as Readonly<Record<string, unknown>>;
    expect(request).toMatchObject({
      type: 'prodivix.execution-server-function-gateway-request.v1',
      requestId: 'remote-invocation-1:1',
      attempt: 1,
      functionRef,
      input: { routeId: 'route-home' },
    });
    expect(JSON.stringify(request)).not.toMatch(/token|session|cookie/iu);
    harness.reply({
      type: 'prodivix.execution-server-function-gateway-response.v1',
      requestId: request.requestId,
      ok: true,
      result: {
        kind: 'value',
        value: {
          providerId: 'prodivix-product-session',
          principalId: 'user-1',
        },
      },
    });
    await expect(invocation).resolves.toEqual({
      kind: 'value',
      value: {
        providerId: 'prodivix-product-session',
        principalId: 'user-1',
      },
    });
    expect(harness.listenerCount()).toBe(0);
  });

  it('rejects non-ExecutionValue input before installing a bridge request', async () => {
    const harness = loadRuntime();
    await expect(
      harness.runtime.invokeWorkspaceServerFunction(
        functionRef,
        {
          routeId: 'route-home',
          invalid: Number.NaN,
        },
        remoteInvocation
      )
    ).rejects.toThrow('SVR_REMOTE_GATEWAY_INVALID');
    let deepInput: unknown = null;
    for (let depth = 0; depth < 66; depth += 1) {
      deepInput = { value: deepInput };
    }
    await expect(
      harness.runtime.invokeWorkspaceServerFunction(
        functionRef,
        deepInput,
        remoteInvocation
      )
    ).rejects.toThrow('SVR_REMOTE_GATEWAY_INVALID');
    expect(harness.posted).toEqual([]);
    expect(harness.listenerCount()).toBe(0);
  });

  it('rejects an invalid success variant and still removes its listener', async () => {
    const harness = loadRuntime();
    const invocation = harness.runtime.invokeWorkspaceServerFunction(
      functionRef,
      { routeId: 'route-home' },
      remoteInvocation
    );
    const request = harness.posted[0] as Readonly<Record<string, unknown>>;
    const rejected = expect(invocation).rejects.toThrow(
      'SVR_REMOTE_GATEWAY_INVALID'
    );
    harness.reply({
      type: 'prodivix.execution-server-function-gateway-response.v1',
      requestId: request.requestId,
      ok: true,
      result: { kind: 'value', value: Number.POSITIVE_INFINITY },
    });
    await rejected;
    expect(harness.listenerCount()).toBe(0);
  });

  it('removes its listener when the parent bridge cannot receive the request', async () => {
    const harness = loadRuntime({ failPost: true });
    await expect(
      harness.runtime.invokeWorkspaceServerFunction(
        functionRef,
        {
          routeId: 'route-home',
        },
        remoteInvocation
      )
    ).rejects.toThrow('SVR_REMOTE_GATEWAY_UNAVAILABLE');
    expect(harness.listenerCount()).toBe(0);
  });

  it('posts an exact cancellation for an accepted Remote invocation', async () => {
    const harness = loadRuntime();
    const cancellation = new AbortController();
    const invocation = harness.runtime.invokeWorkspaceServerFunction(
      functionRef,
      { routeId: 'route-home' },
      { ...remoteInvocation, signal: cancellation.signal }
    );
    cancellation.abort();
    await expect(invocation).rejects.toThrow('SVR_CANCELLED');
    expect(harness.posted).toHaveLength(2);
    expect(harness.posted[1]).toEqual({
      type: 'prodivix.execution-server-function-gateway-cancel.v1',
      requestId: 'remote-invocation-1:1',
      invocationId: 'remote-invocation-1',
    });
    expect(harness.listenerCount()).toBe(0);
  });

  it('runs deterministic mutation fixtures with invocation-key replay fencing', async () => {
    const actionRef = Object.freeze({
      artifactId: 'code-auth',
      exportName: 'updateProfile',
    });
    const bindings: readonly WorkspaceServerRuntimeBinding[] = [
      {
        routeNodeId: 'route-home',
        routeKind: 'action',
        documentPath: '/auth.server.ts',
        definition: {
          reference: actionRef,
          kind: 'route-action',
          runtimeZone: 'server',
          adapterId: 'test.profile.update',
          effect: 'mutation',
          auth: { kind: 'authenticated' },
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['value'],
            properties: { value: { type: 'string' } },
          },
          outputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['updated'],
            properties: { updated: { type: 'boolean' } },
          },
          idempotency: { kind: 'invocation-key' },
        },
      },
    ];
    const harness = loadRuntime({
      target: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
      bindings,
      provisionModule: {
        format: 'prodivix.executable-server-runtime-provision.v1',
        mode: 'deterministic-test',
        provision: {
          format: 'prodivix.server-runtime-test-provision.v1',
          fixtureSetId: 'generated-runtime-test',
          principal: {
            providerId: 'prodivix-test-fixture',
            principalId: 'fixture-user',
          },
          permissions: [],
          fixtures: [
            {
              id: 'update-profile',
              functionRef: actionRef,
              behavior: {
                kind: 'outcome',
                outcome: { kind: 'value', value: { updated: true } },
              },
            },
          ],
        },
      },
    });
    const options = { invocationId: 'action-invocation-1', attempt: 1 };
    await expect(
      harness.runtime.invokeWorkspaceServerFunction(
        actionRef,
        { value: 'Ada' },
        options
      )
    ).resolves.toEqual({ kind: 'value', value: { updated: true } });
    await expect(
      harness.runtime.invokeWorkspaceServerFunction(
        actionRef,
        { value: 'Ada' },
        { ...options, attempt: 2 }
      )
    ).resolves.toEqual({ kind: 'value', value: { updated: true } });
    await expect(
      harness.runtime.invokeWorkspaceServerFunction(
        actionRef,
        { value: 'Grace' },
        { ...options, attempt: 2 }
      )
    ).rejects.toThrow('SVR_TEST_REPLAY_CONFLICT');
    expect(harness.traceLines).toHaveLength(3);
    const traces = harness.traceLines.map(
      (line) => JSON.parse(line) as unknown
    );
    expect(traces).toMatchObject([
      {
        requestId: 'action-invocation-1:1',
        functionRef: actionRef,
        outcome: 'succeeded',
        resultKind: 'value',
        redacted: true,
      },
      {
        requestId: 'action-invocation-1:2',
        outcome: 'succeeded',
        resultKind: 'value',
        redacted: true,
      },
      {
        requestId: 'action-invocation-1:2',
        outcome: 'failed',
        errorCode: 'SVR_TEST_REPLAY_CONFLICT',
        retryable: false,
        redacted: true,
      },
    ]);
    expect(JSON.stringify(traces)).not.toMatch(/Ada|Grace|fixture-user/iu);
  });

  it('loads the exact Browser auth session once and causally drives guard and current-principal loader', async () => {
    const guardRef = Object.freeze({
      artifactId: 'code-auth',
      exportName: 'requireOwner',
    });
    const loaderRef = Object.freeze({
      artifactId: 'code-auth',
      exportName: 'loadPrincipal',
    });
    const bindings: readonly WorkspaceServerRuntimeBinding[] = [
      {
        routeNodeId: 'route-home',
        routeKind: 'guard',
        documentPath: '/auth.server.ts',
        definition: {
          reference: guardRef,
          kind: 'route-guard',
          runtimeZone: 'server',
          adapterId: 'core.auth.require-workspace-owner',
          effect: 'read',
          auth: { kind: 'permission', permissionId: 'workspace.owner' },
          inputSchema: true,
          outputSchema: true,
        },
      },
      {
        routeNodeId: 'route-home',
        routeKind: 'loader',
        documentPath: '/auth.server.ts',
        definition: {
          reference: loaderRef,
          kind: 'route-loader',
          runtimeZone: 'server',
          adapterId: 'core.auth.current-principal',
          effect: 'read',
          auth: { kind: 'authenticated' },
          inputSchema: true,
          outputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['providerId', 'principalId'],
            properties: {
              providerId: { const: 'prodivix-product-session' },
              principalId: { const: 'browser-owner' },
            },
          },
        },
      },
    ];
    const provisionModule = {
      format: 'prodivix.executable-server-runtime-provision.v1',
      mode: 'deterministic-test',
      provision: {
        format: 'prodivix.server-runtime-test-provision.v1',
        fixtureSetId: 'server-fixtures',
        principal: {
          providerId: 'prodivix-product-session',
          principalId: 'embedded-owner-must-not-win',
        },
        permissions: [
          { permissionId: 'workspace.owner', allowed: false, code: 'DENIED' },
        ],
        fixtures: [
          {
            id: 'guard',
            functionRef: guardRef,
            behavior: { kind: 'outcome', outcome: { kind: 'allow' } },
          },
          {
            id: 'loader',
            functionRef: loaderRef,
            behavior: {
              kind: 'outcome',
              outcome: {
                kind: 'value',
                value: { principalId: 'embedded-owner-must-not-win' },
              },
            },
          },
        ],
      },
    };
    const authSessionResponse = {
      format: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
      version: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION,
      fixtureSetId: 'behavior-auth',
      fixtureSetDigest:
        'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      fixtureId: 'browser-owner-session',
      resourceId: 'prodivix-product-session',
      inputDigest:
        'sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      outcomeDigest:
        'sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      projectionDigest:
        'sha256-dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      providerId: 'prodivix-product-session',
      principalId: 'browser-owner',
      permissionIds: ['workspace.owner'],
      invocationId: 'browser-auth-operation',
      attempt: 1,
    };
    const harness = loadRuntime({
      target: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
      traceHost: 'browser',
      bindings,
      provisionModule,
      authSessionResponse,
    });

    await expect(
      harness.runtime.invokeWorkspaceServerFunction(guardRef, {
        routeId: 'route-home',
      })
    ).resolves.toEqual({ kind: 'allow' });
    await expect(
      harness.runtime.invokeWorkspaceServerFunction(loaderRef, {
        routeId: 'route-home',
      })
    ).resolves.toEqual({
      kind: 'value',
      value: {
        providerId: 'prodivix-product-session',
        principalId: 'browser-owner',
      },
    });
    expect(harness.authSessionRequests).toHaveLength(1);
    expect(harness.authSessionRequests[0]).toMatchObject({
      input: EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
      init: {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          Accept: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
        },
      },
    });

    const denied = loadRuntime({
      target: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
      traceHost: 'browser',
      bindings,
      provisionModule,
      authSessionResponse: {
        ...authSessionResponse,
        permissionIds: [],
      },
    });
    await expect(
      denied.runtime.invokeWorkspaceServerFunction(guardRef, {
        routeId: 'route-home',
      })
    ).resolves.toEqual({
      kind: 'deny',
      code: 'AUTH_PERMISSION_DENIED',
    });

    const wrongPrincipal = loadRuntime({
      target: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
      traceHost: 'browser',
      bindings,
      provisionModule,
      authSessionResponse: {
        ...authSessionResponse,
        principalId: 'wrong-browser-owner',
      },
    });
    await expect(
      wrongPrincipal.runtime.invokeWorkspaceServerFunction(loaderRef, {
        routeId: 'route-home',
      })
    ).rejects.toThrow('SVR_OUTPUT_INVALID');

    const oversized = loadRuntime({
      target: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
      traceHost: 'browser',
      bindings,
      provisionModule,
      authSessionResponse: {
        ...authSessionResponse,
        permissionIds: Array.from(
          { length: 256 },
          (_, index) => `p${String(index).padStart(3, '0')}${'a'.repeat(252)}`
        ),
      },
    });
    await expect(
      oversized.runtime.invokeWorkspaceServerFunction(guardRef, {
        routeId: 'route-home',
      })
    ).rejects.toThrow('SVR_TEST_AUTH_SESSION_INVALID');

    const unavailable = loadRuntime({
      target: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
      traceHost: 'browser',
      bindings,
      provisionModule,
    });
    await expect(
      unavailable.runtime.invokeWorkspaceServerFunction(guardRef, {
        routeId: 'route-home',
      })
    ).rejects.toThrow('SVR_TEST_AUTH_SESSION_UNAVAILABLE');
    expect(unavailable.authSessionRequests).toHaveLength(1);
  });

  it('hard-cuts the auth fixture endpoint and crypto fallback from production code', async () => {
    const module = createWorkspaceStandaloneServerRuntimeModules(
      EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      []
    ).find(({ id }) => id === WORKSPACE_SERVER_RUNTIME_MODULE_ID)!;
    expect(module.sourceTrace).toEqual([
      {
        sourceRef: {
          domain: 'workspace',
          id: 'workspace-server-runtime',
          path: '/',
        },
      },
    ]);
    const generated = module.body;
    expect(generated).not.toContain(
      EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH
    );
    expect(generated).not.toContain('globalThis.crypto');
    expect(generated).toContain(
      `export const prodivixServerRuntimeTarget = Object.freeze(${JSON.stringify(
        EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET
      )} as const);`
    );
    const harness = loadRuntime();
    await expect(
      harness.runtime.invokeWorkspaceServerFunction(functionRef, {
        routeId: 'route-home',
      })
    ).rejects.toThrow('SVR_INVOCATION_ID_UNAVAILABLE');
  });

  it('keeps deterministic browser fixtures filesystem-free and ephemeral', async () => {
    const harness = loadRuntime({
      target: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
      traceHost: 'browser',
      bindings: [
        {
          routeNodeId: 'route-home',
          routeKind: 'loader',
          documentPath: '/auth.server.ts',
          definition: {
            reference: functionRef,
            kind: 'route-loader',
            runtimeZone: 'server',
            adapterId: 'test.principal.load',
            effect: 'read',
            auth: { kind: 'public' },
            inputSchema: true,
            outputSchema: true,
          },
        },
      ],
      provisionModule: {
        format: 'prodivix.executable-server-runtime-provision.v1',
        mode: 'deterministic-test',
        provision: {
          format: 'prodivix.server-runtime-test-provision.v1',
          fixtureSetId: 'browser-fixture',
          permissions: [],
          fixtures: [
            {
              id: 'load-principal',
              functionRef,
              behavior: {
                kind: 'outcome',
                outcome: { kind: 'value', value: { displayName: 'Ada' } },
              },
            },
          ],
        },
      },
    });
    await expect(
      harness.runtime.invokeWorkspaceServerFunction(
        functionRef,
        { routeId: 'route-home' },
        { invocationId: 'browser-load', attempt: 1 }
      )
    ).resolves.toEqual({ kind: 'value', value: { displayName: 'Ada' } });
    expect(harness.traceLines).toEqual([]);
  });

  it('fails closed when a Node Test host cannot expose the builtin trace port', async () => {
    const harness = loadRuntime({
      target: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
      traceHost: 'node-without-builtin-port',
      bindings: [
        {
          routeNodeId: 'route-home',
          routeKind: 'loader',
          documentPath: '/auth.server.ts',
          definition: {
            reference: functionRef,
            kind: 'route-loader',
            runtimeZone: 'server',
            adapterId: 'test.principal.load',
            effect: 'read',
            auth: { kind: 'public' },
            inputSchema: true,
            outputSchema: true,
          },
        },
      ],
      provisionModule: {
        format: 'prodivix.executable-server-runtime-provision.v1',
        mode: 'deterministic-test',
        provision: {
          format: 'prodivix.server-runtime-test-provision.v1',
          fixtureSetId: 'node-fixture',
          permissions: [],
          fixtures: [
            {
              id: 'load-principal',
              functionRef,
              behavior: {
                kind: 'outcome',
                outcome: { kind: 'value', value: { displayName: 'Ada' } },
              },
            },
          ],
        },
      },
    });
    await expect(
      harness.runtime.invokeWorkspaceServerFunction(
        functionRef,
        { routeId: 'route-home' },
        { invocationId: 'node-load', attempt: 1 }
      )
    ).rejects.toThrow('SVR_TEST_TRACE_UNAVAILABLE');
  });

  it('fails closed when deterministic fixtures are projected in disabled mode', async () => {
    const harness = loadRuntime({
      target: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
      provisionModule: {
        format: 'prodivix.executable-server-runtime-provision.v1',
        mode: 'disabled',
      },
    });
    await expect(
      harness.runtime.invokeWorkspaceServerFunction(
        functionRef,
        {
          routeId: 'route-home',
        },
        { invocationId: 'disabled-runtime', attempt: 1 }
      )
    ).rejects.toThrow('SVR_TEST_RUNTIME_DISABLED');
  });
});
