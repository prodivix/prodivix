import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createExecutionRequest,
  projectExecutableProjectRuntimeFiles,
} from '@prodivix/runtime-core';
import {
  ISOLATED_SERVER_FUNCTION_AUTHORITY_FORMAT,
  ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH,
  ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
  ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH,
  readIsolatedServerFunctionExecutionResponse,
} from '@prodivix/server-runtime';
import type { WorkspaceDocument, WorkspaceSnapshot } from '@prodivix/workspace';
import {
  ISOLATED_SERVER_FUNCTION_IMPORT_GRAPH_MAX_MODULES,
  ISOLATED_SERVER_FUNCTION_IMPORT_GRAPH_MAX_SOURCE_BYTES,
} from '#src/executableProject/isolatedServerFunctionImportGraph';
import { generateWorkspaceIsolatedServerFunctionExecutableProject } from '#src/executableProject/isolatedServerFunctionProject';

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

const workspace = (
  options: {
    auth?: Readonly<Record<string, string>>;
    effect?: 'read' | 'mutation';
    kind?: 'route-loader' | 'route-guard';
    adapterId?: string;
    authProviderId?: string;
    includeAuthConfig?: boolean;
    permissionIds?: readonly string[];
    source?: string;
    environment?: Readonly<Record<string, unknown>>;
  } = {}
): WorkspaceSnapshot => {
  const includeAuthConfig =
    options.includeAuthConfig ?? options.auth?.kind !== undefined;
  return {
    id: 'isolated-workspace',
    workspaceRev: 2,
    routeRev: 1,
    opSeq: 3,
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: [
          'function-node',
          ...(includeAuthConfig ? ['config-dir'] : []),
        ],
      },
      'function-node': {
        id: 'function-node',
        kind: 'doc',
        name: 'greeting.server.ts',
        parentId: 'root',
        docId: 'code-greeting',
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
      'code-greeting': {
        id: 'code-greeting',
        type: 'code',
        path: '/greeting.server.ts',
        contentRev: 5,
        metaRev: 1,
        content: {
          language: 'ts',
          source:
            options.source ??
            `export const loadGreeting = (input: { name: string }) => ({ kind: 'value' as const, value: { message: 'Hello ' + input.name } });`,
          metadata: {
            'prodivix.serverRuntime': {
              schemaVersion: '1.0',
              functionsByExport: {
                loadGreeting: {
                  kind: options.kind ?? 'route-loader',
                  runtimeZone: 'server',
                  adapterId: options.adapterId ?? 'prodivix.code-export',
                  effect: options.effect ?? 'read',
                  auth: options.auth ?? { kind: 'public' },
                  inputSchema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['name'],
                    properties: { name: { type: 'string' } },
                  },
                  outputSchema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['message'],
                    properties: { message: { type: 'string' } },
                  },
                  ...(options.effect === 'mutation'
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
    routeManifest: { version: '1', root: { id: 'root', children: [] } },
  };
};

const functionRef = Object.freeze({
  artifactId: 'code-greeting',
  exportName: 'loadGreeting',
});

const codeModule = (
  id: string,
  path: string,
  source: string,
  language: 'ts' | 'js' = 'ts'
): WorkspaceDocument => ({
  id,
  type: 'code',
  path,
  contentRev: 1,
  metaRev: 1,
  content: { language, source },
});

const withCodeModules = (
  candidate: WorkspaceSnapshot,
  modules: readonly WorkspaceDocument[]
): WorkspaceSnapshot => ({
  ...candidate,
  docsById: {
    ...candidate.docsById,
    ...Object.fromEntries(modules.map((document) => [document.id, document])),
  },
});

const importedWorkspace = (
  modules: readonly WorkspaceDocument[] = [
    codeModule(
      'code-greeting-helper',
      '/lib/greeting.ts',
      `import { punctuation } from './punctuation.js';
export const greeting = (name: string) => 'Hello ' + name + punctuation;`
    ),
    codeModule(
      'code-punctuation-helper',
      '/lib/punctuation.ts',
      `export const punctuation = '!';`
    ),
  ]
): WorkspaceSnapshot =>
  withCodeModules(
    workspace({
      source: `import { greeting } from './lib/greeting.ts';
export const loadGreeting = (input: { name: string }) => ({ kind: 'value' as const, value: { message: greeting(input.name) } });`,
    }),
    modules
  );

describe('isolated Server Function executable project', () => {
  it('runs a bounded canonical import graph through the production one-shot plan', async () => {
    const result = generateWorkspaceIsolatedServerFunctionExecutableProject(
      importedWorkspace(),
      { functionRef }
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.snapshot).toMatchObject({
      format: 'prodivix.executable-project.v6',
      entrypoints: [{ kind: 'production' }],
      capabilityRequirements: {
        preview: [],
        build: [],
        test: [],
        production: expect.arrayContaining([
          'cancellation',
          'filesystem',
          'server-function',
        ]),
      },
      serverFunctionPlan: {
        format: 'prodivix.executable-server-function-plan.v1',
        functionRef,
      },
    });
    expect(result.snapshot.capabilityRequirements.production).not.toContain(
      'network'
    );
    const moduleFiles = result.snapshot.files.filter((file) =>
      file.path.startsWith('src/.prodivix/server-runtime/modules/')
    );
    expect(moduleFiles).toHaveLength(2);
    expect(moduleFiles.map((file) => file.sourceTrace?.[0]?.sourceRef)).toEqual(
      [
        { kind: 'code-artifact', artifactId: 'code-greeting-helper' },
        { kind: 'code-artifact', artifactId: 'code-punctuation-helper' },
      ]
    );
    expect(
      result.snapshot.files.find(
        ({ path }) =>
          path === result.snapshot.serverFunctionPlan?.sourceFilePath
      )?.contents
    ).toContain('./modules/module-001.mjs');
    expect(moduleFiles[0]?.contents).toContain('./module-002.mjs');

    const root = await mkdtemp(join(process.cwd(), '.isolated-runtime-'));
    temporaryRoots.push(root);
    for (const file of projectExecutableProjectRuntimeFiles(
      result.snapshot,
      'production'
    )) {
      const path = join(root, ...file.path.split('/'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.contents);
    }
    const bridgeRequest = Object.freeze({
      type: 'prodivix.execution-server-function-gateway-request.v1' as const,
      requestId: 'isolated-invocation:1',
      invocationId: 'isolated-invocation',
      attempt: 1,
      functionRef,
      input: Object.freeze({ name: 'Prodivix' }),
    });
    await mkdir(join(root, '.prodivix'), { recursive: true });
    await writeFile(
      join(root, '.prodivix', 'server-function-invocation.json'),
      JSON.stringify(bridgeRequest)
    );
    await execFileAsync(
      process.execPath,
      [result.snapshot.serverFunctionPlan!.entrypointFilePath],
      {
        cwd: root,
        windowsHide: true,
      }
    );
    const response = JSON.parse(
      await readFile(
        join(root, '.prodivix', 'server-function-result.json'),
        'utf8'
      )
    ) as unknown;
    const request = createExecutionRequest({
      requestId: 'production-request',
      profile: 'production',
      runtimeZone: 'server',
      workspace: result.snapshot.workspace,
      invocation: {
        kind: 'code',
        targetRef: { kind: 'code-artifact', artifactId: 'code-greeting' },
        entrypoint: 'loadGreeting',
        input: bridgeRequest,
      },
      requiredCapabilities: ['server-function'],
    });
    expect(
      readIsolatedServerFunctionExecutionResponse(
        response,
        request,
        result.snapshot.serverFunctionPlan
      )
    ).toMatchObject({
      ok: true,
      result: { kind: 'value', value: { message: 'Hello Prodivix!' } },
    });
  });

  it('runs a workspace.owner read guard only after the permission authority is granted', async () => {
    const result = generateWorkspaceIsolatedServerFunctionExecutableProject(
      workspace({
        auth: { kind: 'permission', permissionId: 'workspace.owner' },
        kind: 'route-guard',
        source: `export const loadGreeting = (_input: unknown, context: { principal?: { providerId: string; principalId: string } }) => context.principal?.providerId === 'prodivix-product-session' && context.principal.principalId === 'user-1' ? ({ kind: 'allow' as const }) : ({ kind: 'deny' as const, code: 'AUTHORITY_MISSING' });`,
      }),
      { functionRef }
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const root = await mkdtemp(join(process.cwd(), '.isolated-auth-runtime-'));
    temporaryRoots.push(root);
    for (const file of projectExecutableProjectRuntimeFiles(
      result.snapshot,
      'production'
    )) {
      const path = join(root, ...file.path.split('/'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.contents);
    }
    const bridgeRequest = Object.freeze({
      type: 'prodivix.execution-server-function-gateway-request.v1' as const,
      requestId: 'authenticated-invocation:1',
      invocationId: 'authenticated-invocation',
      attempt: 1,
      functionRef,
      input: Object.freeze({ name: 'ignored' }),
    });
    await mkdir(join(root, '.prodivix'), { recursive: true });
    await writeFile(
      join(root, '.prodivix', 'server-function-invocation.json'),
      JSON.stringify(bridgeRequest)
    );
    const authorityPath = join(
      root,
      ...ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH.split('/')
    );
    await writeFile(
      authorityPath,
      JSON.stringify({
        format: ISOLATED_SERVER_FUNCTION_AUTHORITY_FORMAT,
        workspaceId: result.snapshot.workspace.workspaceId,
        snapshotId: result.snapshot.workspace.snapshotId,
        principal: {
          providerId: 'prodivix-product-session',
          principalId: 'user-1',
        },
        permissions: ['workspace.owner'],
        expiresAt: Date.now() + 60_000,
      })
    );
    await execFileAsync(
      process.execPath,
      [result.snapshot.serverFunctionPlan!.entrypointFilePath],
      { cwd: root, windowsHide: true }
    );
    await expect(readFile(authorityPath, 'utf8')).rejects.toThrow();
    const response = JSON.parse(
      await readFile(
        join(root, '.prodivix', 'server-function-result.json'),
        'utf8'
      )
    ) as unknown;
    const request = createExecutionRequest({
      requestId: 'authenticated-production-request',
      profile: 'production',
      runtimeZone: 'server',
      workspace: result.snapshot.workspace,
      invocation: {
        kind: 'code',
        targetRef: { kind: 'code-artifact', artifactId: 'code-greeting' },
        entrypoint: 'loadGreeting',
        input: bridgeRequest,
      },
      requiredCapabilities: ['server-function'],
    });
    expect(
      readIsolatedServerFunctionExecutionResponse(
        response,
        request,
        result.snapshot.serverFunctionPlan
      )
    ).toMatchObject({
      ok: true,
      result: { kind: 'allow' },
    });
    expect(JSON.stringify(response)).not.toContain('sessionId');

    await writeFile(
      authorityPath,
      JSON.stringify({
        format: ISOLATED_SERVER_FUNCTION_AUTHORITY_FORMAT,
        workspaceId: result.snapshot.workspace.workspaceId,
        snapshotId: result.snapshot.workspace.snapshotId,
        principal: {
          providerId: 'prodivix-product-session',
          principalId: 'user-1',
        },
        permissions: [],
        expiresAt: Date.now() + 60_000,
      })
    );
    await execFileAsync(
      process.execPath,
      [result.snapshot.serverFunctionPlan!.entrypointFilePath],
      { cwd: root, windowsHide: true }
    );
    const deniedPermissionResponse = JSON.parse(
      await readFile(
        join(root, '.prodivix', 'server-function-result.json'),
        'utf8'
      )
    ) as unknown;
    expect(
      readIsolatedServerFunctionExecutionResponse(
        deniedPermissionResponse,
        request,
        result.snapshot.serverFunctionPlan
      )
    ).toMatchObject({
      ok: false,
      error: { code: 'SVR_AUTHORITY_INVALID', retryable: false },
    });

    await execFileAsync(
      process.execPath,
      [result.snapshot.serverFunctionPlan!.entrypointFilePath],
      { cwd: root, windowsHide: true }
    );
    const missingAuthorityResponse = JSON.parse(
      await readFile(
        join(root, '.prodivix', 'server-function-result.json'),
        'utf8'
      )
    ) as unknown;
    expect(
      readIsolatedServerFunctionExecutionResponse(
        missingAuthorityResponse,
        request,
        result.snapshot.serverFunctionPlan
      )
    ).toMatchObject({
      ok: false,
      error: { code: 'SVR_AUTHORITY_INVALID', retryable: false },
    });
  });

  it('runs a declared Secret through one-shot useSecret without projecting material', async () => {
    const secretCanary = 'isolated-secret-canary-value';
    const result = generateWorkspaceIsolatedServerFunctionExecutableProject(
      workspace({
        environment: {
          secretsByField: {
            signingKey: { bindingId: 'webhook-signing-key' },
          },
        },
        source: `export const loadGreeting = async (input: { name: string }, context: { useSecret?: (field: string, consumer: (material: string) => void) => Promise<void> }) => {
  let keyLength = 0;
  await context.useSecret?.('signingKey', (material) => { keyLength = material.length; });
  return { kind: 'value' as const, value: { message: input.name + ':' + keyLength } };
};`,
      }),
      { functionRef }
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.snapshot.capabilityRequirements.production).toContain(
      'environment-binding'
    );
    const root = await mkdtemp(
      join(process.cwd(), '.isolated-secret-runtime-')
    );
    temporaryRoots.push(root);
    for (const file of projectExecutableProjectRuntimeFiles(
      result.snapshot,
      'production'
    )) {
      const path = join(root, ...file.path.split('/'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.contents);
    }
    const bridgeRequest = Object.freeze({
      type: 'prodivix.execution-server-function-gateway-request.v1' as const,
      requestId: 'secret-invocation:1',
      invocationId: 'secret-invocation',
      attempt: 1,
      functionRef,
      input: Object.freeze({ name: 'Ada' }),
    });
    await mkdir(join(root, '.prodivix'), { recursive: true });
    await writeFile(
      join(root, '.prodivix', 'server-function-invocation.json'),
      JSON.stringify(bridgeRequest)
    );
    const secretPath = join(
      root,
      ...ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH.split('/')
    );
    await writeFile(
      secretPath,
      JSON.stringify({
        format: ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
        fields: { signingKey: secretCanary },
      })
    );
    await execFileAsync(
      process.execPath,
      [result.snapshot.serverFunctionPlan!.entrypointFilePath],
      { cwd: root, windowsHide: true }
    );
    await expect(readFile(secretPath, 'utf8')).rejects.toThrow();
    const responseText = await readFile(
      join(root, '.prodivix', 'server-function-result.json'),
      'utf8'
    );
    expect(responseText).not.toContain(secretCanary);
    const request = createExecutionRequest({
      requestId: 'secret-production-request',
      profile: 'production',
      runtimeZone: 'server',
      workspace: result.snapshot.workspace,
      invocation: {
        kind: 'code',
        targetRef: { kind: 'code-artifact', artifactId: 'code-greeting' },
        entrypoint: 'loadGreeting',
        input: bridgeRequest,
      },
      requiredCapabilities: ['environment-binding', 'server-function'],
    });
    expect(
      readIsolatedServerFunctionExecutionResponse(
        JSON.parse(responseText) as unknown,
        request,
        result.snapshot.serverFunctionPlan
      )
    ).toMatchObject({
      ok: true,
      result: {
        kind: 'value',
        value: { message: `Ada:${secretCanary.length}` },
      },
    });
  });

  it('fails protected isolated exports closed without the exact Auth declaration', () => {
    const protectedOptions = {
      auth: { kind: 'permission', permissionId: 'workspace.owner' },
      kind: 'route-guard' as const,
    };
    const cases = [
      {
        candidate: workspace({
          ...protectedOptions,
          includeAuthConfig: false,
        }),
        code: 'WKS-EXPORT-SERVER-AUTH-CONFIG-REQUIRED',
      },
      {
        candidate: workspace({
          ...protectedOptions,
          authProviderId: 'custom-product-session',
        }),
        code: 'WKS-EXPORT-SERVER-AUTH-PROVIDER-UNSUPPORTED',
      },
      {
        candidate: workspace({
          ...protectedOptions,
          permissionIds: [],
        }),
        code: 'WKS-EXPORT-SERVER-PERMISSION-UNDECLARED',
      },
    ];
    for (const candidate of cases) {
      const result = generateWorkspaceIsolatedServerFunctionExecutableProject(
        candidate.candidate,
        { functionRef }
      );
      expect(result).toMatchObject({
        status: 'blocked',
        diagnostics: [{ code: candidate.code }],
      });
    }
  });

  it('keeps mutation and arbitrary adapters closed', () => {
    const cases = [
      {
        candidate: workspace({ effect: 'mutation' }),
        code: 'WKS-EXPORT-SERVER-ISOLATED-POLICY-UNSUPPORTED',
      },
      {
        candidate: workspace({ adapterId: 'custom.backend-eval' }),
        code: 'WKS-EXPORT-SERVER-ISOLATED-POLICY-UNSUPPORTED',
      },
      {
        candidate: workspace({
          auth: { kind: 'permission', permissionId: 'workspace.write' },
        }),
        code: 'WKS-EXPORT-SERVER-ISOLATED-POLICY-UNSUPPORTED',
      },
    ];
    for (const { candidate, code } of cases) {
      const result = generateWorkspaceIsolatedServerFunctionExecutableProject(
        candidate,
        { functionRef }
      );
      expect(result.status).toBe('blocked');
      if (result.status === 'blocked') {
        expect(result.diagnostics).toEqual([
          expect.objectContaining({ code, severity: 'error' }),
        ]);
      }
    }
  });

  it('blocks external, dynamic, CommonJS, reference and unresolved imports before snapshot creation', () => {
    const sources = [
      `import { readFile } from 'node:fs/promises'; export const loadGreeting = () => ({ kind: 'value', value: { message: String(readFile) } });`,
      `export const loadGreeting = async () => { const helper = await import('./helper.ts'); return { kind: 'value', value: { message: String(helper) } }; };`,
      `const helper = require('./helper.ts'); export const loadGreeting = () => ({ kind: 'value', value: { message: String(helper) } });`,
      `import data from './helper.ts' with { type: 'json' }; export const loadGreeting = () => ({ kind: 'value', value: { message: String(data) } });`,
      `/// <reference path="./helper.ts" />\nexport const loadGreeting = () => ({ kind: 'value', value: { message: 'x' } });`,
      `import { missing } from './missing.ts'; export const loadGreeting = () => ({ kind: 'value', value: { message: missing } });`,
      `import { escaped } from '../../outside.ts'; export const loadGreeting = () => ({ kind: 'value', value: { message: escaped } });`,
    ];
    for (const source of sources) {
      const result = generateWorkspaceIsolatedServerFunctionExecutableProject(
        workspace({ source }),
        { functionRef }
      );
      expect(result).toMatchObject({
        status: 'blocked',
        diagnostics: [
          { code: 'WKS-EXPORT-SERVER-ISOLATED-MODULE-UNSUPPORTED' },
        ],
      });
    }
    const transitiveExternal = withCodeModules(
      workspace({
        source: `import { helper } from './helper.ts'; export const loadGreeting = () => ({ kind: 'value', value: { message: helper } });`,
      }),
      [
        codeModule(
          'code-helper',
          '/helper.ts',
          `import { readFile } from 'node:fs'; export const helper = String(readFile);`
        ),
      ]
    );
    expect(
      generateWorkspaceIsolatedServerFunctionExecutableProject(
        transitiveExternal,
        { functionRef }
      )
    ).toMatchObject({
      status: 'blocked',
      diagnostics: [
        {
          code: 'WKS-EXPORT-SERVER-ISOLATED-MODULE-UNSUPPORTED',
          path: '/helper.ts',
        },
      ],
    });
  });

  it('fails closed on ambiguous extensionless imports and graph budget exhaustion', () => {
    const ambiguous = withCodeModules(
      workspace({
        source: `import { value } from './lib/value'; export const loadGreeting = () => ({ kind: 'value', value: { message: value } });`,
      }),
      [
        codeModule(
          'code-value-ts',
          '/lib/value.ts',
          `export const value = 'ts';`
        ),
        codeModule(
          'code-value-js',
          '/lib/value.js',
          `export const value = 'js';`,
          'js'
        ),
      ]
    );
    expect(
      generateWorkspaceIsolatedServerFunctionExecutableProject(ambiguous, {
        functionRef,
      })
    ).toMatchObject({
      status: 'blocked',
      diagnostics: [
        {
          code: 'WKS-EXPORT-SERVER-ISOLATED-MODULE-UNSUPPORTED',
          message: expect.stringMatching(/ambiguously/u),
        },
      ],
    });

    const helpers = Array.from(
      { length: ISOLATED_SERVER_FUNCTION_IMPORT_GRAPH_MAX_MODULES },
      (_, index) =>
        codeModule(
          `code-budget-${index}`,
          `/budget/module-${index}.ts`,
          `export const value${index} = ${index};`
        )
    );
    const imports = helpers
      .map(
        (_, index) =>
          `import { value${index} } from './budget/module-${index}.ts';`
      )
      .join('\n');
    const budget = withCodeModules(
      workspace({
        source: `${imports}\nexport const loadGreeting = () => ({ kind: 'value', value: { message: String(value0) } });`,
      }),
      helpers
    );
    expect(
      generateWorkspaceIsolatedServerFunctionExecutableProject(budget, {
        functionRef,
      })
    ).toMatchObject({
      status: 'blocked',
      diagnostics: [
        {
          code: 'WKS-EXPORT-SERVER-ISOLATED-MODULE-UNSUPPORTED',
          message: expect.stringMatching(/128 modules/u),
        },
      ],
    });

    const sourceBudget = workspace({
      source: `${' '.repeat(
        ISOLATED_SERVER_FUNCTION_IMPORT_GRAPH_MAX_SOURCE_BYTES
      )}\nexport const loadGreeting = () => ({ kind: 'value', value: { message: 'x' } });`,
    });
    expect(
      generateWorkspaceIsolatedServerFunctionExecutableProject(sourceBudget, {
        functionRef,
      })
    ).toMatchObject({
      status: 'blocked',
      diagnostics: [
        {
          code: 'WKS-EXPORT-SERVER-ISOLATED-MODULE-UNSUPPORTED',
          message: expect.stringMatching(/source bytes/u),
        },
      ],
    });

    const depthModules = Array.from({ length: 65 }, (_, index) =>
      codeModule(
        `code-depth-${index}`,
        `/depth/module-${index}.ts`,
        index === 64
          ? `export const value${index} = ${index};`
          : `import { value${index + 1} } from './module-${index + 1}.ts'; export const value${index} = value${index + 1};`
      )
    );
    const depth = withCodeModules(
      workspace({
        source: `import { value0 } from './depth/module-0.ts'; export const loadGreeting = () => ({ kind: 'value', value: { message: String(value0) } });`,
      }),
      depthModules
    );
    expect(
      generateWorkspaceIsolatedServerFunctionExecutableProject(depth, {
        functionRef,
      })
    ).toMatchObject({
      status: 'blocked',
      diagnostics: [
        {
          code: 'WKS-EXPORT-SERVER-ISOLATED-MODULE-UNSUPPORTED',
          message: expect.stringMatching(/64 levels/u),
        },
      ],
    });
  });

  it('projects cycles and document insertion order deterministically', () => {
    const modules = [
      codeModule(
        'code-cycle-a',
        '/cycle/a.ts',
        `import { b } from './b.ts'; export const a = () => b;`
      ),
      codeModule(
        'code-cycle-b',
        '/cycle/b.ts',
        `import { a } from './a.ts'; export const b = () => a;`
      ),
    ];
    const candidate = (ordered: readonly WorkspaceDocument[]) =>
      withCodeModules(
        workspace({
          source: `import { a } from './cycle/a.ts'; export const loadGreeting = () => ({ kind: 'value', value: { message: typeof a } });`,
        }),
        ordered
      );
    const first = generateWorkspaceIsolatedServerFunctionExecutableProject(
      candidate(modules),
      { functionRef }
    );
    const second = generateWorkspaceIsolatedServerFunctionExecutableProject(
      candidate([...modules].reverse()),
      { functionRef }
    );
    expect(first.status).toBe('ready');
    expect(second.status).toBe('ready');
    if (first.status !== 'ready' || second.status !== 'ready') return;
    expect(first.snapshot.contentDigest).toBe(second.snapshot.contentDigest);
    expect(first.snapshot.files).toEqual(second.snapshot.files);
  });

  it('requires the exact canonical named export definition', () => {
    const result = generateWorkspaceIsolatedServerFunctionExecutableProject(
      workspace(),
      {
        functionRef: {
          artifactId: functionRef.artifactId,
          exportName: 'missingExport',
        },
      }
    );
    expect(result).toMatchObject({
      status: 'blocked',
      diagnostics: [{ code: 'WKS-EXPORT-SERVER-ISOLATED-DEFINITION-MISSING' }],
    });
  });
});
