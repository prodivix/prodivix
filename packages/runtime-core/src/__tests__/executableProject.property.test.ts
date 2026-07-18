import { describe, expect, it } from 'vitest';
import {
  assertExecutableProjectCapabilitySupport,
  createExecutableProjectSnapshot,
  EXECUTABLE_PROJECT_SNAPSHOT_FORMAT,
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectSnapshotInput,
} from '../executableProject';

const createInput = (): ExecutableProjectSnapshotInput => ({
  workspace: {
    workspaceId: 'workspace-1',
    snapshotId: 'snapshot-1',
    partitionRevisions: {
      route: '2',
      workspace: '1',
    },
  },
  target: {
    presetId: 'react-vite',
    framework: 'react',
    runtime: 'vite',
  },
  files: [
    {
      path: 'src/main.ts',
      contents: 'export const value = 1;',
      sourceTrace: [
        {
          sourceRef: { kind: 'workspace', workspaceId: 'workspace-1' } as const,
          label: 'main',
        },
      ],
    },
    { path: 'package.json', contents: '{"private":true}' },
  ],
  dependencyPlan: { manifestFilePath: 'package.json' },
  entrypoints: [{ kind: 'preview' as const, path: 'src/main.ts' }],
  capabilityRequirements: {
    preview: ['filesystem', 'dependency-install'] as const,
    build: ['filesystem', 'build'] as const,
    test: ['filesystem', 'test'] as const,
  },
  publicBuildConfiguration: [],
  resourceHints: { timeoutMs: 30_000 },
  cacheHints: { dependencyInstall: 'reuse-if-matched' as const },
  dataMockProvision: {
    fixtureSetId: 'catalog-test',
    emulatedAdapterIds: ['core.http'],
    collections: [
      {
        id: 'products',
        entityIdKey: 'id',
        initialEntities: [{ id: 'p1', name: 'Chair' }],
      },
    ],
    fixtures: [
      {
        id: 'products-page-2',
        documentId: 'data-products',
        operationId: 'list-products',
        operationKind: 'query',
        input: { page: 2 },
        behavior: {
          kind: 'result',
          value: { items: [{ id: 'p1' }] },
          empty: false,
          page: {
            kind: 'offset',
            offset: 20,
            limit: 20,
            total: 21,
            hasMore: true,
          },
        },
      },
      {
        id: 'products-state',
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
    fixtureSetId: 'auth-test',
    principal: {
      providerId: 'prodivix-test-fixture',
      principalId: 'fixture-user',
    },
    permissions: [{ permissionId: 'workspace.owner', allowed: true }],
    fixtures: [],
  },
  installCommand: { command: 'corepack', args: ['pnpm', 'install'] },
  previewCommand: { command: 'pnpm', args: ['run', 'dev'] },
  buildCommand: { command: 'pnpm', args: ['run', 'build'] },
  testPlan: {
    framework: 'vitest' as const,
    command: { command: 'pnpm', args: ['run', 'test'] },
    reportFilePath: '.prodivix/report.json',
  },
});

const createProductionInput = (): ExecutableProjectSnapshotInput => {
  const base = createInput();
  return {
    ...base,
    files: [
      ...base.files,
      {
        path: 'src/.prodivix/server-runtime/invoke.mjs',
        contents: 'export {};',
      },
      {
        path: 'src/.prodivix/server-runtime/function.mjs',
        contents: 'export const getGreeting = () => undefined;',
      },
    ],
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
    dataMockProvision: undefined,
    serverRuntimeMockProvision: undefined,
    serverFunctionPlan: {
      command: {
        command: 'node',
        args: ['src/.prodivix/server-runtime/invoke.mjs'],
      },
      entrypointFilePath: 'src/.prodivix/server-runtime/invoke.mjs',
      sourceFilePath: 'src/.prodivix/server-runtime/function.mjs',
      functionRef: {
        artifactId: 'code-server-greeting',
        exportName: 'getGreeting',
      },
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
  };
};

describe('executable project snapshot properties', () => {
  it('normalizes order and derives one deterministic SHA-256 content digest', () => {
    const input = createInput();
    const left = createExecutableProjectSnapshot(input);
    const right = createExecutableProjectSnapshot({
      ...input,
      workspace: {
        ...input.workspace,
        partitionRevisions: {
          workspace: '1',
          route: '2',
        },
      },
      files: [...input.files].reverse(),
    });

    expect(left).toEqual(right);
    expect(left.format).toBe(EXECUTABLE_PROJECT_SNAPSHOT_FORMAT);
    expect(left.contentDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(left.files.map((file) => file.path)).toEqual([
      'package.json',
      'src/main.ts',
    ]);
    expect(Object.isFrozen(left)).toBe(true);
    expect(Object.isFrozen(left.files)).toBe(true);
  });

  it('changes the digest for executable content, commands, target, or source trace', () => {
    const input = createInput();
    const baseline = createExecutableProjectSnapshot(input).contentDigest;
    const variants = [
      {
        ...input,
        files: input.files.map((file) =>
          file.path === 'package.json' ? { ...file, contents: '{}' } : file
        ),
      },
      {
        ...input,
        previewCommand: {
          command: 'pnpm' as const,
          args: ['run', 'preview'],
        },
      },
      {
        ...input,
        buildPlan: { outputDirectoryPath: 'build-output' },
      },
      {
        ...input,
        previewPlan: { entryFilePath: 'preview.html' },
      },
      { ...input, target: { ...input.target, framework: 'vue' } },
      {
        ...input,
        dataMockProvision: {
          ...input.dataMockProvision!,
          fixtureSetId: 'catalog-test-changed',
        },
      },
      {
        ...input,
        serverRuntimeMockProvision: {
          format: 'prodivix.server-runtime-test-provision.v1',
          fixtureSetId: 'auth-test-changed',
          principal: {
            providerId: 'prodivix-test-fixture',
            principalId: 'fixture-user',
          },
          permissions: [{ permissionId: 'workspace.owner', allowed: true }],
          fixtures: [],
        },
      },
      {
        ...input,
        files: input.files.map((file) =>
          file.path === 'src/main.ts'
            ? {
                ...file,
                sourceTrace: [
                  {
                    sourceRef: {
                      kind: 'workspace' as const,
                      workspaceId: 'workspace-2',
                    },
                  },
                ],
              }
            : file
        ),
      },
    ];

    variants.forEach((variant) => {
      expect(createExecutableProjectSnapshot(variant).contentDigest).not.toBe(
        baseline
      );
    });
  });

  it('clones binary contents before publishing the immutable snapshot', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const snapshot = createExecutableProjectSnapshot({
      ...createInput(),
      files: [...createInput().files, { path: 'asset.bin', contents: bytes }],
    });

    bytes[0] = 9;
    expect(snapshot.files[0]?.contents).toEqual(new Uint8Array([1, 2, 3]));
  });

  it.each([
    '../escape.ts',
    '/absolute.ts',
    'C:/drive.ts',
    'src\\windows.ts',
    'src//empty.ts',
  ])('rejects unsafe project path %s', (path) => {
    expect(() =>
      createExecutableProjectSnapshot({
        ...createInput(),
        files: [...createInput().files, { path, contents: '' }],
      })
    ).toThrow(TypeError);
  });

  it('rejects duplicate topology and literal environment escape hatches', () => {
    expect(() =>
      createExecutableProjectSnapshot({
        ...createInput(),
        files: [...createInput().files, { path: 'src', contents: '' }],
      })
    ).toThrow(/both a file and a directory/u);

    expect(() =>
      createExecutableProjectSnapshot({
        ...createInput(),
        previewCommand: {
          command: 'pnpm',
          args: ['run', 'dev'],
          environment: { SECRET: 'material' },
        } as never,
      })
    ).toThrow(/unsupported field: environment/u);

    expect(() =>
      createExecutableProjectSnapshot({
        ...createInput(),
        previewCommand: { command: 'powershell', args: ['-Command', 'echo'] },
      } as never)
    ).toThrow(/not allowlisted/u);

    expect(() =>
      createExecutableProjectSnapshot({
        ...createInput(),
        files: [
          ...createInput().files,
          { path: 'dist/already-authored.js', contents: '' },
        ],
      })
    ).toThrow(/build output directory conflicts/u);
  });

  it('strictly normalizes bounded Data mock provisioning', () => {
    const snapshot = createExecutableProjectSnapshot(createInput());
    expect(snapshot.dataMockProvision).toMatchObject({
      fixtureSetId: 'catalog-test',
      emulatedAdapterIds: ['core.http'],
      fixtures: expect.arrayContaining([
        expect.objectContaining({
          operationKind: 'query',
          behavior: expect.objectContaining({ kind: 'result', empty: false }),
        }),
        expect.objectContaining({
          operationKind: 'mutation',
          behavior: expect.objectContaining({
            kind: 'crud',
            collectionId: 'products',
          }),
        }),
      ]),
      collections: [
        {
          id: 'products',
          entityIdKey: 'id',
          initialEntities: [{ id: 'p1', name: 'Chair' }],
        },
      ],
    });
    expect(Object.isFrozen(snapshot.dataMockProvision?.fixtures)).toBe(true);
    const runtimeProvision = projectExecutableProjectRuntimeFiles(
      snapshot
    ).find(({ path }) => path === 'public/.prodivix/data-mock-provision.json');
    expect(runtimeProvision?.contents).toContain('catalog-test');
    expect(snapshot.files).not.toContainEqual(runtimeProvision);
    expect(
      projectExecutableProjectRuntimeFiles(snapshot, 'build').some(
        ({ path }) => path === 'public/.prodivix/data-mock-provision.json'
      )
    ).toBe(false);
    const previewManifest = projectExecutableProjectRuntimeFiles(
      snapshot,
      'preview'
    ).find(({ path }) => path === 'public/.prodivix/data-runtime.json');
    const buildManifest = projectExecutableProjectRuntimeFiles(
      snapshot,
      'build'
    ).find(({ path }) => path === 'public/.prodivix/data-runtime.json');
    expect(previewManifest?.contents).toContain('"mode":"mock"');
    expect(buildManifest?.contents).toContain('"mode":"live"');
    expect(() =>
      createExecutableProjectSnapshot({
        ...createInput(),
        dataMockProvision: {
          ...createInput().dataMockProvision!,
          fixtures: [
            {
              ...createInput().dataMockProvision!.fixtures[0]!,
              behavior: {
                ...createInput().dataMockProvision!.fixtures[0]!.behavior,
                secretRef: { secretId: 'must-not-pass' },
              },
            },
          ],
        },
      } as never)
    ).toThrow(/unsupported field: secretRef/u);
    expect(() =>
      createExecutableProjectSnapshot({
        ...createInput(),
        files: [
          ...createInput().files,
          {
            path: 'public/.prodivix/data-mock-provision.json',
            contents: '{}',
          },
        ],
      })
    ).toThrow(/reserved for runtime projection/u);
    expect(() =>
      createExecutableProjectSnapshot({
        ...createInput(),
        files: [
          ...createInput().files,
          { path: 'public/.prodivix/data-runtime.json', contents: '{}' },
        ],
      })
    ).toThrow(/reserved for runtime projection/u);
  });

  it('projects deterministic Server Runtime fixtures only into Test execution', () => {
    const snapshot = createExecutableProjectSnapshot(createInput());
    expect(snapshot.serverRuntimeMockProvision).toMatchObject({
      format: 'prodivix.server-runtime-test-provision.v1',
      fixtureSetId: 'auth-test',
      principal: {
        providerId: 'prodivix-test-fixture',
        principalId: 'fixture-user',
      },
    });
    expect(Object.isFrozen(snapshot.serverRuntimeMockProvision)).toBe(true);

    const testProjection = projectExecutableProjectRuntimeFiles(
      snapshot,
      'test'
    ).find(
      ({ path }) => path === 'src/.prodivix/server-runtime-test-provision.ts'
    );
    const previewProjection = projectExecutableProjectRuntimeFiles(
      snapshot,
      'preview'
    ).find(
      ({ path }) => path === 'src/.prodivix/server-runtime-test-provision.ts'
    );
    const buildProjection = projectExecutableProjectRuntimeFiles(
      snapshot,
      'build'
    ).find(
      ({ path }) => path === 'src/.prodivix/server-runtime-test-provision.ts'
    );
    expect(testProjection?.contents).toContain('"mode":"deterministic-test"');
    expect(testProjection?.contents).toContain('"fixtureSetId":"auth-test"');
    expect(previewProjection?.contents).toContain('"mode":"disabled"');
    expect(previewProjection?.contents).not.toContain('fixture-user');
    expect(buildProjection?.contents).toContain('"mode":"disabled"');
    expect(buildProjection?.contents).not.toContain('fixture-user');
    expect(snapshot.files).not.toContainEqual(testProjection);

    expect(() =>
      createExecutableProjectSnapshot({
        ...createInput(),
        serverRuntimeMockProvision: {
          format: 'prodivix.server-runtime-test-provision.v1',
          fixtureSetId: 'auth-test',
          permissions: [],
          fixtures: [],
          sessionId: 'authority-material',
        },
      } as never)
    ).toThrow(/forbidden authority material/u);
    expect(() =>
      createExecutableProjectSnapshot({
        ...createInput(),
        files: [
          ...createInput().files,
          {
            path: 'src/.prodivix/server-runtime-test-provision.ts',
            contents: 'export default {};',
          },
        ],
      })
    ).toThrow(/reserved for runtime projection/u);
  });

  it('binds the production entrypoint and runtime manifest into the snapshot digest', () => {
    const input = createProductionInput();
    const snapshot = createExecutableProjectSnapshot(input);
    expect(snapshot).toMatchObject({
      format: 'prodivix.executable-project.v6',
      entrypoints: [
        {
          kind: 'production',
          path: 'src/.prodivix/server-runtime/invoke.mjs',
        },
      ],
      serverFunctionPlan: {
        format: 'prodivix.executable-server-function-plan.v1',
        invocationFilePath: '.prodivix/server-function-invocation.json',
        resultFilePath: '.prodivix/server-function-result.json',
        functionRef: {
          artifactId: 'code-server-greeting',
          exportName: 'getGreeting',
        },
      },
    });
    expect(Object.isFrozen(snapshot.serverFunctionPlan)).toBe(true);
    expect(
      createExecutableProjectSnapshot({
        ...input,
        serverFunctionPlan: {
          ...input.serverFunctionPlan!,
          runtimeManifest: {
            ...(input.serverFunctionPlan!.runtimeManifest as Readonly<
              Record<string, unknown>
            >),
            schemaVersion: '1.1',
          } as never,
        },
      }).contentDigest
    ).not.toBe(snapshot.contentDigest);
    expect(
      projectExecutableProjectRuntimeFiles(snapshot, 'production').some(
        ({ path }) =>
          path === snapshot.serverFunctionPlan!.invocationFilePath ||
          path === snapshot.serverFunctionPlan!.resultFilePath
      )
    ).toBe(false);
  });

  it('fails closed on incomplete or conflicting production plans', () => {
    const input = createProductionInput();
    expect(() =>
      createExecutableProjectSnapshot({
        ...input,
        serverFunctionPlan: undefined,
      })
    ).toThrow(/production entrypoint/u);
    expect(() =>
      createExecutableProjectSnapshot({
        ...input,
        capabilityRequirements: {
          ...input.capabilityRequirements,
          production: ['artifacts', 'cancellation', 'filesystem'],
        },
      })
    ).toThrow(/server-function/u);
    expect(() =>
      createExecutableProjectSnapshot({
        ...input,
        serverFunctionPlan: {
          ...input.serverFunctionPlan!,
          resultFilePath: 'src/.prodivix/server-runtime/function.mjs',
        },
      })
    ).toThrow(/runtime paths conflict/u);
    expect(() =>
      createExecutableProjectSnapshot({
        ...input,
        entrypoints: [{ kind: 'preview', path: 'src/main.ts' }],
      })
    ).toThrow(/production entrypoint/u);
  });

  it('fails closed when an adapter cannot satisfy the operation capabilities', () => {
    const snapshot = createExecutableProjectSnapshot(createInput());
    expect(() =>
      assertExecutableProjectCapabilitySupport(snapshot, 'preview', [
        'filesystem',
      ])
    ).toThrow(/dependency-install/u);
    expect(() =>
      assertExecutableProjectCapabilitySupport(snapshot, 'preview', [
        'dependency-install',
        'filesystem',
      ])
    ).not.toThrow();
  });
});
