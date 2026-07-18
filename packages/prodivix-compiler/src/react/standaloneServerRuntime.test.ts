import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import Ajv2020 from 'ajv/dist/2020.js';
import { createWorkspaceStandaloneServerRuntimeModule } from '#src/react/standaloneServerRuntime';
import {
  DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
  EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
  type WorkspaceServerRuntimeBinding,
  type WorkspaceServerRuntimeTarget,
} from '#src/react/workspaceServerRuntimeTarget';

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

const loadRuntime = (
  options: {
    failPost?: boolean;
    target?: WorkspaceServerRuntimeTarget;
    bindings?: readonly WorkspaceServerRuntimeBinding[];
    provisionModule?: unknown;
  } = {}
) => {
  const generated = createWorkspaceStandaloneServerRuntimeModule(
    options.target ?? EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
    options.bindings
  );
  const transpiled = ts.transpileModule(
    `import Ajv2020 from 'ajv/dist/2020.js';\n${generated.body}`,
    {
      fileName: 'prodivix-server-runtime.ts',
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        strict: true,
      },
    }
  ).outputText;
  const listeners = new Set<
    (event: { source: unknown; data: unknown }) => void
  >();
  const posted: unknown[] = [];
  const parent = {
    postMessage(value: unknown) {
      if (options.failPost) throw new Error('frame unavailable');
      posted.push(value);
    },
  };
  const runtimeGlobal = {
    parent,
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
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
  };
  const exports: Record<string, unknown> = {};
  const require = (id: string) => {
    if (id === 'ajv/dist/2020.js') return Ajv2020;
    if (id === './.prodivix/server-runtime-test-provision') {
      return options.provisionModule;
    }
    throw new Error(`Unexpected generated import: ${id}`);
  };
  new Function('exports', 'require', 'globalThis', transpiled)(
    exports,
    require,
    runtimeGlobal
  );
  return {
    runtime: exports as RuntimeExports,
    posted,
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

describe('standalone Server Function runtime', () => {
  it('uses one bounded value-only request and resolves a strict response', async () => {
    const harness = loadRuntime();
    const invocation = harness.runtime.invokeWorkspaceServerFunction(
      functionRef,
      { routeId: 'route-home' }
    );
    const request = harness.posted[0] as Readonly<Record<string, unknown>>;
    expect(request).toMatchObject({
      type: 'prodivix.execution-server-function-gateway-request.v1',
      requestId: '00000000-0000-4000-8000-000000000001:1',
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
      harness.runtime.invokeWorkspaceServerFunction(functionRef, {
        routeId: 'route-home',
        invalid: Number.NaN,
      })
    ).rejects.toThrow('SVR_REMOTE_GATEWAY_INVALID');
    let deepInput: unknown = null;
    for (let depth = 0; depth < 66; depth += 1) {
      deepInput = { value: deepInput };
    }
    await expect(
      harness.runtime.invokeWorkspaceServerFunction(functionRef, deepInput)
    ).rejects.toThrow('SVR_REMOTE_GATEWAY_INVALID');
    expect(harness.posted).toEqual([]);
    expect(harness.listenerCount()).toBe(0);
  });

  it('rejects an invalid success variant and still removes its listener', async () => {
    const harness = loadRuntime();
    const invocation = harness.runtime.invokeWorkspaceServerFunction(
      functionRef,
      { routeId: 'route-home' }
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
      harness.runtime.invokeWorkspaceServerFunction(functionRef, {
        routeId: 'route-home',
      })
    ).rejects.toThrow('SVR_REMOTE_GATEWAY_UNAVAILABLE');
    expect(harness.listenerCount()).toBe(0);
  });

  it('posts an exact cancellation for an accepted Remote invocation', async () => {
    const harness = loadRuntime();
    const cancellation = new AbortController();
    const invocation = harness.runtime.invokeWorkspaceServerFunction(
      functionRef,
      { routeId: 'route-home' },
      { signal: cancellation.signal }
    );
    cancellation.abort();
    await expect(invocation).rejects.toThrow('SVR_CANCELLED');
    expect(harness.posted).toHaveLength(2);
    expect(harness.posted[1]).toEqual({
      type: 'prodivix.execution-server-function-gateway-cancel.v1',
      requestId: '00000000-0000-4000-8000-000000000001:1',
      invocationId: '00000000-0000-4000-8000-000000000001',
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
      harness.runtime.invokeWorkspaceServerFunction(functionRef, {
        routeId: 'route-home',
      })
    ).rejects.toThrow('SVR_TEST_RUNTIME_DISABLED');
  });
});
