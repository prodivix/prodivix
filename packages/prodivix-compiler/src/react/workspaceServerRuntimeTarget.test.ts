import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { createEmptyPirDocument } from '@prodivix/pir';
import { projectExecutableProjectRuntimeFiles } from '@prodivix/runtime-core';
import type { ServerRuntimeTestProvision } from '@prodivix/server-runtime';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { generateWorkspaceReactViteExecutableProject } from '#src/executableProject/workspaceExecutableProject';
import { generateWorkspaceReactViteBundle } from '#src/react/workspaceProject';
import {
  DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
  EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
  STATIC_CLIENT_SERVER_RUNTIME_TARGET,
} from '#src/react/workspaceServerRuntimeTarget';

const SERVER_SOURCE_CANARY = 'server-source-must-not-enter-client-import-graph';

const createServerWorkspace = (
  options: {
    kind?: 'route-loader' | 'route-action' | 'route-guard';
    adapterId?: string;
    auth?: Readonly<Record<string, string>>;
    authProviderId?: string;
    includeAuthConfig?: boolean;
    permissionIds?: readonly string[];
    referenceExportName?: string;
    omitIdempotency?: boolean;
    effect?: 'read' | 'mutation';
    environment?: Readonly<Record<string, unknown>>;
  } = {}
): WorkspaceSnapshot => {
  const kind = options.kind ?? 'route-loader';
  const exportName =
    kind === 'route-loader'
      ? 'loadPrincipal'
      : kind === 'route-action'
        ? 'updateProfile'
        : 'guardRoute';
  const runtimeField =
    kind === 'route-loader'
      ? 'loaderRef'
      : kind === 'route-action'
        ? 'actionRef'
        : 'guardRef';
  const includeAuthConfig = options.includeAuthConfig !== false;
  return {
    id: 'server-runtime-workspace',
    workspaceRev: 4,
    routeRev: 3,
    opSeq: 9,
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: [
          'page-node',
          'auth-node',
          ...(includeAuthConfig ? ['config-dir'] : []),
        ],
      },
      'page-node': {
        id: 'page-node',
        kind: 'doc',
        name: 'home.pir.json',
        parentId: 'root',
        docId: 'page-home',
      },
      'auth-node': {
        id: 'auth-node',
        kind: 'doc',
        name: 'auth.server.ts',
        parentId: 'root',
        docId: 'code-auth',
      },
      ...(includeAuthConfig
        ? {
            'config-dir': {
              id: 'config-dir',
              kind: 'dir' as const,
              name: 'config',
              parentId: 'root',
              children: ['auth-config-node'],
            },
            'auth-config-node': {
              id: 'auth-config-node',
              kind: 'doc' as const,
              name: 'auth.json',
              parentId: 'config-dir',
              docId: 'auth-config',
            },
          }
        : {}),
    },
    docsById: {
      'page-home': {
        id: 'page-home',
        type: 'pir-page',
        path: '/home.pir.json',
        contentRev: 2,
        metaRev: 1,
        content: createEmptyPirDocument(),
      },
      'code-auth': {
        id: 'code-auth',
        type: 'code',
        path: '/auth.server.ts',
        contentRev: 7,
        metaRev: 1,
        content: {
          language: 'ts',
          source: `export const ${exportName} = () => '${SERVER_SOURCE_CANARY}';`,
          metadata: {
            'prodivix.serverRuntime': {
              schemaVersion: '1.0',
              functionsByExport: {
                [exportName]: {
                  kind,
                  runtimeZone: 'server',
                  adapterId:
                    options.adapterId ??
                    (kind === 'route-loader'
                      ? 'core.auth.current-principal'
                      : kind === 'route-action'
                        ? 'test.profile.update'
                        : 'core.auth.require-workspace-owner'),
                  effect:
                    options.effect ??
                    (kind === 'route-action' ? 'mutation' : 'read'),
                  auth:
                    options.auth ??
                    (kind === 'route-loader' || kind === 'route-action'
                      ? { kind: 'authenticated' }
                      : {
                          kind: 'permission',
                          permissionId: 'workspace.owner',
                        }),
                  inputSchema:
                    kind === 'route-action'
                      ? true
                      : {
                          type: 'object',
                          additionalProperties: false,
                          required: ['routeId'],
                          properties: { routeId: { type: 'string' } },
                        },
                  outputSchema:
                    kind === 'route-loader'
                      ? {
                          type: 'object',
                          additionalProperties: false,
                          required: ['providerId', 'principalId'],
                          properties: {
                            providerId: {
                              const: 'prodivix-product-session',
                            },
                            principalId: { type: 'string' },
                          },
                        }
                      : true,
                  ...(kind === 'route-action' &&
                  (options.effect ?? 'mutation') === 'mutation' &&
                  !options.omitIdempotency
                    ? { idempotency: { kind: 'invocation-key' } }
                    : {}),
                  ...(options.environment
                    ? { environment: options.environment }
                    : {}),
                },
              },
            },
          },
        },
      },
      ...(includeAuthConfig
        ? {
            'auth-config': {
              id: 'auth-config',
              type: 'project-config' as const,
              path: '/config/auth.json',
              contentRev: 1,
              metaRev: 1,
              content: {
                kind: 'config' as const,
                value: {
                  schemaVersion: '1.0',
                  providerId:
                    options.authProviderId ?? 'prodivix-product-session',
                  permissionIds: options.permissionIds ?? ['workspace.owner'],
                },
              },
            },
          }
        : {}),
    },
    routeManifest: {
      version: '1',
      root: {
        id: 'root',
        children: [
          {
            id: 'route-home',
            index: true,
            pageDocId: 'page-home',
            runtime: {
              [runtimeField]: {
                artifactId: 'code-auth',
                exportName: options.referenceExportName ?? exportName,
              },
            },
          },
        ],
      },
    },
  };
};

const createServerTestProvision = (input: {
  exportName: string;
  outcome: Readonly<Record<string, unknown>>;
  fixtureInput?: Readonly<Record<string, unknown>>;
}): ServerRuntimeTestProvision => ({
  format: 'prodivix.server-runtime-test-provision.v1',
  fixtureSetId: 'compiler-auth-test',
  principal: {
    providerId: 'prodivix-test-fixture',
    principalId: 'fixture-user',
  },
  permissions: [{ permissionId: 'workspace.owner', allowed: true }],
  fixtures: [
    {
      id: `fixture-${input.exportName}`,
      functionRef: {
        artifactId: 'code-auth',
        exportName: input.exportName,
      },
      ...(input.fixtureInput ? { input: input.fixtureInput } : {}),
      behavior: {
        kind: 'outcome',
        outcome: input.outcome as never,
      },
    },
  ],
});

describe('Workspace Auth/Server runtime target Gate', () => {
  it('blocks Browser and static export when a route requires a Server Function', () => {
    const bundle = generateWorkspaceReactViteBundle(createServerWorkspace());
    expect(STATIC_CLIENT_SERVER_RUNTIME_TARGET.kind).toBe('static-client');
    expect(bundle.metadata?.exportBlocked).toBe(true);
    expect(bundle.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'WKS-EXPORT-SERVER-GATEWAY-REQUIRED',
        path: '/auth.server.ts',
      })
    );
  });

  it('projects an authenticated Remote bridge without importing server source into App', () => {
    const result = generateWorkspaceReactViteExecutableProject(
      createServerWorkspace(),
      {
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      }
    );
    expect(
      result.status,
      result.status === 'blocked' ? JSON.stringify(result.diagnostics) : ''
    ).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.snapshot.capabilityRequirements.preview).toContain(
      'server-function'
    );
    const app = result.snapshot.files.find(
      (file) => file.path === 'src/App.tsx'
    );
    const runtime = result.snapshot.files.find(
      (file) => file.path === 'src/prodivix-server-runtime.ts'
    );
    expect(app?.contents).toContain("kind: 'server-function'");
    expect(app?.contents).toContain('invokeWorkspaceServerFunction');
    expect(app?.contents).not.toContain(SERVER_SOURCE_CANARY);
    expect(app?.contents).not.toMatch(
      /import\s*\{\s*loadPrincipal\s*\}[^;]*auth\.server/u
    );
    expect(runtime?.contents).toContain(
      'prodivix.execution-server-function-gateway-request.v1'
    );
    expect(runtime?.contents).not.toContain('sessionId');
    expect(runtime?.contents).not.toContain('accessToken');
    expect(
      result.snapshot.files.some((file) =>
        file.contents.includes(SERVER_SOURCE_CANARY)
      )
    ).toBe(false);
    for (const file of [app, runtime]) {
      expect(typeof file?.contents).toBe('string');
      const transpiled = ts.transpileModule(file!.contents as string, {
        fileName: file!.path,
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          strict: true,
        },
      });
      expect(
        transpiled.diagnostics?.filter(
          (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
        ) ?? []
      ).toEqual([]);
    }
  });

  it('fails closed on missing, unsupported, or incomplete canonical Auth declarations', () => {
    const cases = [
      {
        workspace: createServerWorkspace({ includeAuthConfig: false }),
        code: 'WKS-EXPORT-SERVER-AUTH-CONFIG-REQUIRED',
      },
      {
        workspace: createServerWorkspace({
          authProviderId: 'custom-product-session',
        }),
        code: 'WKS-EXPORT-SERVER-AUTH-PROVIDER-UNSUPPORTED',
      },
      {
        workspace: createServerWorkspace({
          kind: 'route-guard',
          permissionIds: [],
        }),
        code: 'WKS-EXPORT-SERVER-PERMISSION-UNDECLARED',
      },
    ];
    for (const candidate of cases) {
      const result = generateWorkspaceReactViteExecutableProject(
        candidate.workspace,
        {
          serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
        }
      );
      expect(result.status).toBe('blocked');
      if (result.status === 'blocked') {
        expect(result.diagnostics).toContainEqual(
          expect.objectContaining({ code: candidate.code })
        );
      }
    }
  });

  it('supports the exact workspace-owner guard and blocks arbitrary Backend adapters', () => {
    const guard = generateWorkspaceReactViteExecutableProject(
      createServerWorkspace({ kind: 'route-guard' }),
      {
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      }
    );
    expect(guard.status).toBe('ready');

    const unsupported = generateWorkspaceReactViteExecutableProject(
      createServerWorkspace({ adapterId: 'custom.eval-source' }),
      {
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      }
    );
    expect(unsupported.status).toBe('blocked');
    if (unsupported.status !== 'blocked') return;
    expect(unsupported.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'WKS-EXPORT-SERVER-ADAPTER-UNSUPPORTED',
      })
    );
  });

  it('opens only the invocation-key fenced execution-state live mutation adapter', () => {
    const accepted = generateWorkspaceReactViteExecutableProject(
      createServerWorkspace({
        kind: 'route-action',
        adapterId: 'core.server.execution-state.put',
      }),
      {
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      }
    );
    expect(
      accepted.status,
      accepted.status === 'blocked' ? JSON.stringify(accepted.diagnostics) : ''
    ).toBe('ready');
    if (accepted.status === 'ready') {
      const runtime = accepted.snapshot.files.find(
        ({ path }) => path === 'src/prodivix-server-runtime.ts'
      );
      expect(runtime?.contents).toContain('SVR-3001');
      expect(runtime?.contents).not.toContain(SERVER_SOURCE_CANARY);
    }

    const missingReplayFence = generateWorkspaceReactViteExecutableProject(
      createServerWorkspace({
        kind: 'route-action',
        adapterId: 'core.server.execution-state.put',
        omitIdempotency: true,
      }),
      {
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      }
    );
    expect(missingReplayFence.status).toBe('blocked');
    if (missingReplayFence.status === 'blocked') {
      expect(missingReplayFence.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'WKS-EXPORT-SERVER-ADAPTER-UNSUPPORTED',
        })
      );
    }
  });

  it('opens the audited Remote live HMAC Secret vertical and propagates environment-binding', () => {
    const workspace = createServerWorkspace({
      kind: 'route-action',
      adapterId: 'core.server.hmac-sha256',
      effect: 'read',
      environment: {
        secretsByField: {
          key: { bindingId: 'webhook-signing-key' },
        },
      },
    });
    const remote = generateWorkspaceReactViteExecutableProject(workspace, {
      serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
    });
    expect(
      remote.status,
      remote.status === 'blocked' ? JSON.stringify(remote.diagnostics) : ''
    ).toBe('ready');
    if (remote.status !== 'ready') return;
    expect(remote.snapshot.capabilityRequirements.preview).toEqual(
      expect.arrayContaining(['environment-binding', 'server-function'])
    );
    expect(JSON.stringify(remote.snapshot)).not.toContain(
      'secret-material-canary'
    );
    expect(
      remote.snapshot.files.some(({ contents }) =>
        typeof contents === 'string'
          ? contents.includes(SERVER_SOURCE_CANARY)
          : false
      )
    ).toBe(false);

    const deterministic = generateWorkspaceReactViteExecutableProject(
      workspace,
      {
        serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
        serverRuntimeMockProvision: createServerTestProvision({
          exportName: 'updateProfile',
          outcome: {
            kind: 'value',
            value: { algorithm: 'HMAC-SHA256', digest: 'fixture-digest' },
          },
        }),
      }
    );
    expect(deterministic.status).toBe('blocked');
    if (deterministic.status === 'blocked') {
      expect(deterministic.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'WKS-EXPORT-SERVER-ENVIRONMENT-UNSUPPORTED',
        })
      );
    }

    const staticBundle = generateWorkspaceReactViteBundle(workspace);
    expect(staticBundle.metadata?.exportBlocked).toBe(true);
    expect(staticBundle.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'WKS-EXPORT-SERVER-GATEWAY-REQUIRED',
      })
    );
  });

  it('rejects Secret privilege on non-audited Remote adapters', () => {
    const result = generateWorkspaceReactViteExecutableProject(
      createServerWorkspace({
        environment: {
          secretsByField: {
            key: { bindingId: 'webhook-signing-key' },
          },
        },
      }),
      {
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      }
    );
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'WKS-EXPORT-SERVER-ADAPTER-UNSUPPORTED',
        })
      );
    }
  });

  it('blocks an undeclared Server Function export without emitting the profiled source', () => {
    const bundle = generateWorkspaceReactViteBundle(
      createServerWorkspace({ referenceExportName: 'missingServerExport' }),
      {
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      }
    );
    expect(bundle.metadata?.exportBlocked).toBe(true);
    expect(bundle.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'WKS-EXPORT-SERVER-DEFINITION-MISSING',
      })
    );
    expect(
      bundle.files.some((file) => file.contents.includes(SERVER_SOURCE_CANARY))
    ).toBe(false);
  });

  it('preserves the existing local route runtime export shape', () => {
    const profiled = createServerWorkspace();
    const localCode = profiled.docsById['code-auth'];
    const localWorkspace: WorkspaceSnapshot = {
      ...profiled,
      docsById: {
        ...profiled.docsById,
        'code-auth': {
          ...localCode,
          content: {
            language: 'ts',
            source: 'export const loadPrincipal = () => ({ local: true });',
          },
        },
      },
    };
    const result = generateWorkspaceReactViteExecutableProject(localWorkspace);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const app = result.snapshot.files.find(
      (file) => file.path === 'src/App.tsx'
    );
    expect(app?.contents).toMatch(
      /"route-home": \{ loader: workspaceRouteRuntime\d+ \}/u
    );
    expect(app?.contents).not.toContain("kind: 'local'");
  });

  it('projects deterministic Auth fixtures only for Test execution', () => {
    const provision = createServerTestProvision({
      exportName: 'loadPrincipal',
      outcome: {
        kind: 'value',
        value: {
          providerId: 'prodivix-product-session',
          principalId: 'fixture-user',
        },
      },
    });
    const result = generateWorkspaceReactViteExecutableProject(
      createServerWorkspace(),
      {
        serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
        serverRuntimeMockProvision: provision,
      }
    );
    expect(
      result.status,
      result.status === 'blocked' ? JSON.stringify(result.diagnostics) : ''
    ).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.snapshot.capabilityRequirements.preview).not.toContain(
      'server-function'
    );
    expect(result.snapshot.capabilityRequirements.build).not.toContain(
      'server-function'
    );
    expect(result.snapshot.capabilityRequirements.test).toContain(
      'server-function'
    );
    expect(result.snapshot.serverRuntimeMockProvision).toEqual(provision);
    const generatedRuntime = result.snapshot.files.find(
      ({ path }) => path === 'src/prodivix-server-runtime.ts'
    );
    expect(generatedRuntime?.contents).toContain(
      "import serverRuntimeTestProvision from './.prodivix/server-runtime-test-provision'"
    );
    expect(generatedRuntime?.contents).not.toContain("from 'node:fs'");
    expect(generatedRuntime?.contents).toContain(
      "process.getBuiltinModule('node:fs')"
    );
    expect(generatedRuntime?.contents).not.toContain('fixture-user');
    const testProvision = projectExecutableProjectRuntimeFiles(
      result.snapshot,
      'test'
    ).find(
      ({ path }) => path === 'src/.prodivix/server-runtime-test-provision.ts'
    );
    const previewProvision = projectExecutableProjectRuntimeFiles(
      result.snapshot,
      'preview'
    ).find(
      ({ path }) => path === 'src/.prodivix/server-runtime-test-provision.ts'
    );
    expect(testProvision?.contents).toContain('"mode":"deterministic-test"');
    expect(testProvision?.contents).toContain('fixture-user');
    expect(previewProvision?.contents).toContain('"mode":"disabled"');
    expect(previewProvision?.contents).not.toContain('fixture-user');
  });

  it('fails deterministic Test export without exact fixtures or mutation replay fencing', () => {
    const noFixture = generateWorkspaceReactViteExecutableProject(
      createServerWorkspace(),
      {
        serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
        serverRuntimeMockProvision: {
          ...createServerTestProvision({
            exportName: 'loadPrincipal',
            outcome: { kind: 'allow' },
          }),
          fixtures: [],
        },
      }
    );
    expect(noFixture.status).toBe('blocked');
    if (noFixture.status === 'blocked') {
      expect(noFixture.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'WKS-EXPORT-SERVER-TEST-FIXTURE-MISSING',
        })
      );
    }

    const action = generateWorkspaceReactViteExecutableProject(
      createServerWorkspace({
        kind: 'route-action',
        omitIdempotency: true,
      }),
      {
        serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
        serverRuntimeMockProvision: createServerTestProvision({
          exportName: 'updateProfile',
          outcome: { kind: 'value', value: { updated: true } },
        }),
      }
    );
    expect(action.status).toBe('blocked');
    if (action.status === 'blocked') {
      expect(action.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'WKS-EXPORT-SERVER-MUTATION-IDEMPOTENCY-REQUIRED',
        })
      );
    }
  });

  it('blocks workspace.write project-source mutation even with an exact deterministic fixture', () => {
    const provision = createServerTestProvision({
      exportName: 'updateProfile',
      outcome: { kind: 'value', value: { updated: true } },
    });
    const result = generateWorkspaceReactViteExecutableProject(
      createServerWorkspace({
        kind: 'route-action',
        adapterId: 'prodivix.code-export',
        auth: { kind: 'permission', permissionId: 'workspace.write' },
        permissionIds: ['workspace.write'],
        effect: 'mutation',
      }),
      {
        serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
        serverRuntimeMockProvision: {
          ...provision,
          permissions: [{ permissionId: 'workspace.write', allowed: true }],
        },
      }
    );
    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'WKS-EXPORT-SERVER-TEST-SOURCE-MUTATION-UNSUPPORTED',
        })
      );
    }
  });

  it('generates a typed cancellable Route action dispatcher for deterministic mutation tests', () => {
    const result = generateWorkspaceReactViteExecutableProject(
      createServerWorkspace({ kind: 'route-action' }),
      {
        serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
        serverRuntimeMockProvision: createServerTestProvision({
          exportName: 'updateProfile',
          outcome: { kind: 'value', value: { updated: true } },
        }),
      }
    );
    expect(
      result.status,
      result.status === 'blocked' ? JSON.stringify(result.diagnostics) : ''
    ).toBe('ready');
    if (result.status !== 'ready') return;
    const app = result.snapshot.files.find(
      ({ path }) => path === 'src/App.tsx'
    );
    expect(app?.contents).toContain('dispatchWorkspaceRouteAction');
    expect(app?.contents).toContain("format: 'prodivix.route-action-input.v1'");
    expect(app?.contents).toContain('activeWorkspaceRouteActionController');
    expect(app?.contents).toContain('notifyWorkspaceRouteRevalidation');
    expect(app?.contents).toMatch(
      /"route-home": \{ action: \{ kind: 'server-function'/u
    );
    const transpiled = ts.transpileModule(app?.contents ?? '', {
      fileName: 'src/App.tsx',
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        strict: true,
      },
    });
    expect(
      transpiled.diagnostics?.filter(
        ({ category }) => category === ts.DiagnosticCategory.Error
      ) ?? []
    ).toEqual([]);
  });
});
