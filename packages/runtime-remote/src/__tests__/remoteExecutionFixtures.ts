import {
  createExecutableProjectSnapshot,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
  type ExecutionProviderCapability,
} from '@prodivix/runtime-core';

export const remoteServerFunctionFixtureRef = Object.freeze({
  artifactId: 'code-server-greeting',
  exportName: 'getGreeting',
});

export const createRemoteFixtureSnapshot = (
  source = 'export const value = 1;',
  previewCapabilities: readonly ExecutionProviderCapability[] = ['filesystem'],
  binaryAsset?: Uint8Array
) =>
  createExecutableProjectSnapshot({
    workspace: {
      workspaceId: 'workspace-1',
      snapshotId: 'snapshot-1',
      partitionRevisions: { workspace: '1' },
    },
    target: {
      presetId: 'react-vite',
      framework: 'react',
      runtime: 'vite',
    },
    files: [
      { path: 'package.json', contents: '{"private":true}' },
      {
        path: 'src/main.ts',
        contents: source,
        sourceTrace: [
          {
            sourceRef: { kind: 'workspace', workspaceId: 'workspace-1' },
          },
        ],
      },
      {
        path: 'src/auth.server.ts',
        contents: 'export const loadPrincipal = () => undefined;',
        sourceTrace: [
          {
            sourceRef: {
              kind: 'code-artifact',
              artifactId: 'code-auth',
            },
          },
        ],
      },
      ...(binaryAsset
        ? [{ path: 'public/fixture.bin', contents: binaryAsset }]
        : []),
    ],
    dependencyPlan: { manifestFilePath: 'package.json' },
    entrypoints: [
      { kind: 'preview', path: 'src/main.ts' },
      { kind: 'build', path: 'src/main.ts' },
      { kind: 'test', path: 'src/main.ts' },
    ],
    capabilityRequirements: {
      preview: previewCapabilities,
      build: ['filesystem', 'build'],
      test: ['filesystem', 'server-function', 'test'],
    },
    publicBuildConfiguration: [],
    resourceHints: { timeoutMs: 30_000 },
    cacheHints: { dependencyInstall: 'reuse-if-matched' },
    dataMockProvision: {
      fixtureSetId: 'remote-catalog-test',
      emulatedAdapterIds: ['core.http'],
      collections: [
        {
          id: 'products',
          entityIdKey: 'id',
          initialEntities: [{ id: 'fixture-product', name: 'Desk' }],
        },
      ],
      fixtures: [
        {
          id: 'products',
          documentId: 'data-products',
          operationId: 'list-products',
          operationKind: 'query',
          behavior: {
            kind: 'result',
            value: [{ id: 'fixture-product' }],
            empty: false,
          },
        },
        {
          id: 'create-product',
          documentId: 'data-products',
          operationId: 'create-product',
          operationKind: 'mutation',
          behavior: {
            kind: 'crud',
            collectionId: 'products',
            action: 'create',
            valueInputKey: 'value',
          },
        },
      ],
    },
    serverRuntimeMockProvision: {
      format: 'prodivix.server-runtime-test-provision.v1',
      fixtureSetId: 'remote-auth-test',
      principal: {
        providerId: 'prodivix-test-fixture',
        principalId: 'test-user',
      },
      permissions: [{ permissionId: 'workspace.owner', allowed: true }],
      fixtures: [],
    },
  });

export const createRemoteFixtureRequest = (requestId = 'request-1') =>
  createExecutionRequest({
    requestId,
    profile: 'preview',
    runtimeZone: 'client',
    workspace: {
      workspaceId: 'workspace-1',
      snapshotId: 'snapshot-1',
      partitionRevisions: { workspace: '1' },
    },
    invocation: {
      kind: 'workspace',
      targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
    },
    requiredCapabilities: ['filesystem'],
  });

export const createRemoteServerFunctionFixtureSnapshot = () =>
  createExecutableProjectSnapshot({
    workspace: {
      workspaceId: 'workspace-1',
      snapshotId: 'snapshot-1',
      partitionRevisions: { workspace: '1' },
    },
    target: {
      presetId: 'isolated-server-function',
      framework: 'typescript',
      runtime: 'node',
    },
    files: [
      {
        path: 'package.json',
        contents: '{"private":true,"type":"module"}',
      },
      {
        path: 'src/.prodivix/server-runtime/invoke.mjs',
        contents: 'export {};',
        sourceTrace: [
          {
            sourceRef: {
              kind: 'code-artifact',
              artifactId: remoteServerFunctionFixtureRef.artifactId,
            },
          },
        ],
      },
      {
        path: 'src/.prodivix/server-runtime/function.mjs',
        contents:
          'export const getGreeting = (input) => ({ kind: "value", value: input });',
        sourceTrace: [
          {
            sourceRef: {
              kind: 'code-artifact',
              artifactId: remoteServerFunctionFixtureRef.artifactId,
            },
          },
        ],
      },
    ],
    dependencyPlan: { manifestFilePath: 'package.json' },
    entrypoints: [
      {
        kind: 'production',
        path: 'src/.prodivix/server-runtime/invoke.mjs',
      },
    ],
    capabilityRequirements: {
      preview: [],
      build: [],
      test: [],
      production: [
        'artifacts',
        'cancellation',
        'dependency-install',
        'filesystem',
        'server-function',
        'source-trace',
        'streaming-logs',
        'timeout',
      ],
    },
    publicBuildConfiguration: [],
    cacheHints: { dependencyInstall: 'isolated' },
    serverFunctionPlan: {
      format: EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
      command: {
        command: 'node',
        args: ['src/.prodivix/server-runtime/invoke.mjs'],
      },
      entrypointFilePath: 'src/.prodivix/server-runtime/invoke.mjs',
      sourceFilePath: 'src/.prodivix/server-runtime/function.mjs',
      functionRef: remoteServerFunctionFixtureRef,
      runtimeManifest: {
        schemaVersion: '1.0',
        functionsByExport: {
          getGreeting: {
            kind: 'function',
            runtimeZone: 'server',
            adapterId: 'prodivix.code-export',
            effect: 'read',
            auth: { kind: 'public' },
            inputSchema: true,
            outputSchema: true,
          },
        },
      },
    },
  });

export const createRemoteServerFunctionFixtureRequest = (
  invocationId = 'server-function-invocation-1'
) =>
  createExecutionRequest({
    requestId: `remote-${invocationId}`,
    profile: 'production',
    runtimeZone: 'server',
    workspace: {
      workspaceId: 'workspace-1',
      snapshotId: 'snapshot-1',
      partitionRevisions: { workspace: '1' },
    },
    invocation: {
      kind: 'code',
      targetRef: {
        kind: 'code-artifact',
        artifactId: remoteServerFunctionFixtureRef.artifactId,
      },
      entrypoint: remoteServerFunctionFixtureRef.exportName,
      input: {
        type: 'prodivix.execution-server-function-gateway-request.v1',
        requestId: `${invocationId}:1`,
        invocationId,
        attempt: 1,
        functionRef: remoteServerFunctionFixtureRef,
        input: { name: 'Ada' },
      },
    },
    requiredCapabilities: ['artifacts', 'filesystem', 'server-function'],
  });

export const remoteFixtureProvider = createExecutionProviderDescriptor({
  id: 'prodivix.remote.fixture',
  version: '1',
  displayName: 'Remote Fixture',
  isolation: 'remote-isolated',
  profiles: ['preview', 'test', 'build'],
  runtimeZones: ['client', 'test', 'build'],
  invocationKinds: ['workspace', 'test', 'build'],
  capabilities: [
    'artifacts',
    'build',
    'cancellation',
    'filesystem',
    'source-trace',
    'streaming-logs',
    'test',
  ],
});
