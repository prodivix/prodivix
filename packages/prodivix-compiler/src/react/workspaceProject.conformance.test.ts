import { describe, expect, it } from 'vitest';
import {
  createBinaryAssetBlobReference,
  createBinaryAssetMaterialization,
} from '@prodivix/assets';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectDataMockProvision,
} from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { generateWorkspaceReactViteExecutableProject } from '#src/executableProject/workspaceExecutableProject';
import { compileWorkspaceToExportProgram } from './workspaceProject';

const workspace: WorkspaceSnapshot = {
  id: 'standalone-domain-export',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node', 'graph-node', 'animation-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'page.pir.json',
      parentId: 'root',
      docId: 'page',
    },
    'graph-node': {
      id: 'graph-node',
      kind: 'doc',
      name: 'main.pir-graph.json',
      parentId: 'root',
      docId: 'graph-main',
    },
    'animation-node': {
      id: 'animation-node',
      kind: 'doc',
      name: 'main.pir-animation.json',
      parentId: 'root',
      docId: 'animation-main',
    },
  },
  docsById: {
    page: {
      id: 'page',
      type: 'pir-page',
      path: '/page.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
    'graph-main': {
      id: 'graph-main',
      type: 'pir-graph',
      path: '/main.pir-graph.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        version: 1,
        nodes: [{ id: 'start', data: { kind: 'start' } }],
        edges: [],
      },
    },
    'animation-main': {
      id: 'animation-main',
      type: 'pir-animation',
      path: '/main.pir-animation.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        version: 1,
        target: { kind: 'pir-document', documentId: 'page' },
        timelines: [
          {
            id: 'timeline-main',
            name: 'Main',
            durationMs: 300,
            bindings: [],
          },
        ],
      },
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root', pageDocId: 'page' },
  },
};

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const createWorkspaceWithAsset = (
  mediaType = 'image/png',
  path = '/public/pixel.png',
  contents = PNG_BYTES
): WorkspaceSnapshot => {
  const blob = createBinaryAssetBlobReference({ contents, mediaType });
  return {
    ...workspace,
    treeById: {
      ...workspace.treeById,
      root: {
        ...workspace.treeById.root!,
        children: [...workspace.treeById.root!.children, 'asset-public-dir'],
      },
      'asset-public-dir': {
        id: 'asset-public-dir',
        kind: 'dir',
        name: 'public',
        parentId: 'root',
        children: ['asset-node'],
      },
      'asset-node': {
        id: 'asset-node',
        kind: 'doc',
        name: path.split('/').at(-1) ?? 'asset.bin',
        parentId: 'asset-public-dir',
        docId: 'asset-pixel',
      },
    },
    docsById: {
      ...workspace.docsById,
      'asset-pixel': {
        id: 'asset-pixel',
        type: 'asset',
        path,
        contentRev: 1,
        metaRev: 1,
        content: {
          kind: 'asset',
          mime: blob.mediaType,
          category: 'image',
          size: blob.byteLength,
          blob,
        },
      },
    },
  };
};

const dataMockProvision: ExecutableProjectDataMockProvision = {
  fixtureSetId: 'workspace-test',
  emulatedAdapterIds: ['core.http'],
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
      input: { product: { id: 'fixture-created' } },
      behavior: {
        kind: 'result',
        value: { id: 'fixture-created' },
        empty: false,
      },
    },
  ],
};

const workspaceWithData = (): WorkspaceSnapshot => ({
  ...workspace,
  treeById: {
    ...workspace.treeById,
    root: {
      ...workspace.treeById.root!,
      children: [...workspace.treeById.root!.children, 'data-node'],
    },
    'data-node': {
      id: 'data-node',
      kind: 'doc',
      name: 'products.data.json',
      parentId: 'root',
      docId: 'data-products',
    },
  },
  docsById: {
    ...workspace.docsById,
    page: {
      ...workspace.docsById.page!,
      content: {
        ...(workspace.docsById.page!.content as ReturnType<
          typeof createEmptyPirDocument
        >),
        logic: {
          dataById: {
            products: {
              operation: {
                documentId: 'data-products',
                operationId: 'list-products',
              },
            },
          },
        },
        ui: {
          graph: {
            ...(
              workspace.docsById.page!.content as ReturnType<
                typeof createEmptyPirDocument
              >
            ).ui.graph,
            nodesById: {
              root: {
                id: 'root',
                kind: 'element',
                type: 'container',
                events: {
                  onClick: {
                    kind: 'dispatch-data-operation',
                    operation: {
                      documentId: 'data-products',
                      operationId: 'create-product',
                    },
                    input: {
                      kind: 'object',
                      propertiesByKey: {
                        product: {
                          kind: 'trigger-payload',
                          path: '/product',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    'data-products': {
      id: 'data-products',
      type: 'data-source',
      path: '/products.data.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        source: {
          id: 'products',
          adapterId: 'core.http',
          runtimeZone: 'client',
          bindingsById: {},
          configurationByKey: {},
        },
        schemasById: {
          products: {
            id: 'products',
            schema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'array',
              items: { type: 'object' },
            },
          },
        },
        operationsById: {
          'list-products': {
            id: 'list-products',
            kind: 'query',
            outputSchemaId: 'products',
            configurationByKey: {},
            policies: {},
          },
          'create-product': {
            id: 'create-product',
            kind: 'mutation',
            outputSchemaId: 'products',
            configurationByKey: {},
            policies: {},
          },
        },
      },
    },
  },
});

describe('standalone domain export conformance', () => {
  it('fails closed when a canonical asset has no verified materialization', () => {
    const project = generateWorkspaceReactViteExecutableProject(
      createWorkspaceWithAsset()
    );

    expect(project).toMatchObject({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'AST-1001' })],
    });
  });

  it('preserves exact binary bytes in the provider-neutral executable snapshot', () => {
    const assetWorkspace = createWorkspaceWithAsset();
    const document = assetWorkspace.docsById['asset-pixel']!;
    const reference = (
      document.content as {
        blob: ReturnType<typeof createBinaryAssetBlobReference>;
      }
    ).blob;
    const project = generateWorkspaceReactViteExecutableProject(
      assetWorkspace,
      {
        assetMaterializations: [
          createBinaryAssetMaterialization({
            assetDocumentId: document.id,
            reference,
            contents: PNG_BYTES,
          }),
        ],
      }
    );

    expect(
      project.status,
      project.status === 'blocked' ? JSON.stringify(project.diagnostics) : ''
    ).toBe('ready');
    if (project.status !== 'ready') return;
    const emitted = project.snapshot.files.find(
      ({ path }) => path === 'public/pixel.png'
    );
    expect(emitted?.contents).toEqual(PNG_BYTES);
    expect(emitted?.sourceTrace).toContainEqual(
      expect.objectContaining({
        sourceRef: {
          kind: 'document',
          workspaceId: assetWorkspace.id,
          documentId: document.id,
        },
      })
    );
    expect(JSON.stringify(project.snapshot)).not.toContain(reference.digest);
    expect(JSON.stringify(project.snapshot)).not.toContain('workspace-blob');
  });

  it('blocks materialization identity drift before export planning', () => {
    const assetWorkspace = createWorkspaceWithAsset();
    const driftedBytes = new Uint8Array([1, 2, 3]);
    const driftedReference = createBinaryAssetBlobReference({
      contents: driftedBytes,
      mediaType: 'image/png',
    });
    const project = generateWorkspaceReactViteExecutableProject(
      assetWorkspace,
      {
        assetMaterializations: [
          createBinaryAssetMaterialization({
            assetDocumentId: 'asset-pixel',
            reference: driftedReference,
            contents: driftedBytes,
          }),
        ],
      }
    );

    expect(project).toMatchObject({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'AST-1003' })],
    });
  });

  it('blocks active content from the public delivery root', () => {
    const svgBytes = new TextEncoder().encode('<svg></svg>');
    const assetWorkspace = createWorkspaceWithAsset(
      'image/svg+xml',
      '/public/icon.svg',
      svgBytes
    );
    const reference = (
      assetWorkspace.docsById['asset-pixel']!.content as {
        blob: ReturnType<typeof createBinaryAssetBlobReference>;
      }
    ).blob;
    const project = generateWorkspaceReactViteExecutableProject(
      assetWorkspace,
      {
        assetMaterializations: [
          createBinaryAssetMaterialization({
            assetDocumentId: 'asset-pixel',
            reference,
            contents: svgBytes,
          }),
        ],
      }
    );

    expect(project).toMatchObject({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'AST-1101' })],
    });
  });

  it('blocks download-only media from static public delivery', () => {
    const pdfBytes = new TextEncoder().encode('%PDF-1.7');
    const assetWorkspace = createWorkspaceWithAsset(
      'application/pdf',
      '/public/manual.pdf',
      pdfBytes
    );
    const reference = (
      assetWorkspace.docsById['asset-pixel']!.content as {
        blob: ReturnType<typeof createBinaryAssetBlobReference>;
      }
    ).blob;
    const project = generateWorkspaceReactViteExecutableProject(
      assetWorkspace,
      {
        assetMaterializations: [
          createBinaryAssetMaterialization({
            assetDocumentId: 'asset-pixel',
            reference,
            contents: pdfBytes,
          }),
        ],
      }
    );

    expect(project).toMatchObject({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'AST-1102' })],
    });
  });

  it('compiles NodeGraph and Animation documents into the Workspace program', () => {
    const program = compileWorkspaceToExportProgram(workspace);

    expect(program.modules.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'nodegraph:graph-main',
        'animation:animation-main:timeline-main',
      ])
    );
    expect(program.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'WKS-EXPORT-DOCUMENT-UNSUPPORTED' })
    );
  });

  it('produces the provider-neutral executable project from the exact revision', () => {
    const result = generateWorkspaceReactViteExecutableProject(workspace);

    expect(
      result.status,
      result.status === 'blocked' ? JSON.stringify(result.diagnostics) : ''
    ).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.snapshot).toMatchObject({
      format: 'prodivix.executable-project.v6',
      workspace: {
        workspaceId: workspace.id,
        snapshotId: expect.stringContaining(`${workspace.id}|w=1|r=1|o=1`),
      },
      target: {
        presetId: 'react-vite',
        framework: 'react',
        runtime: 'vite',
      },
      buildCommand: {
        command: 'corepack',
        args: ['pnpm', 'run', 'build'],
      },
      previewCommand: {
        command: 'corepack',
        args: ['pnpm', 'run', 'dev', '--host', '0.0.0.0'],
      },
      testPlan: {
        command: {
          command: 'corepack',
          args: [
            'pnpm',
            'run',
            'test',
            '--reporter=default',
            '--reporter=json',
            '--no-file-parallelism',
            '--outputFile.json=.prodivix/test-report.json',
          ],
        },
      },
      buildPlan: { outputDirectoryPath: 'dist' },
      previewPlan: {
        mode: 'static-bundle',
        outputDirectoryPath: 'dist',
        entryFilePath: 'index.html',
      },
    });
    expect(result.snapshot.contentDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(result.snapshot.dependencyPlan).toMatchObject({
      manifestFilePath: 'package.json',
      installFingerprint: expect.stringMatching(/^sha256-[a-f0-9]{64}$/u),
    });
    expect(result.snapshot.entrypoints).toEqual([
      { kind: 'build', path: 'index.html' },
      { kind: 'preview', path: 'index.html' },
      { kind: 'test', path: 'src/App.test.tsx' },
    ]);
    expect(result.snapshot.capabilityRequirements.test).toContain('test');
    expect(result.snapshot.publicBuildConfiguration).toEqual([]);
    expect(
      result.snapshot.files.some((file) => file.path === 'package.json')
    ).toBe(true);
    expect(
      result.snapshot.files.find((file) => file.path === 'index.html')
        ?.sourceTrace?.length ?? 0
    ).toBeGreaterThan(0);
  });

  it('projects Data fixture provisioning as execution input instead of generated source', () => {
    const result = generateWorkspaceReactViteExecutableProject(workspace, {
      dataMockProvision,
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.snapshot.dataMockProvision).toMatchObject({
      fixtureSetId: 'workspace-test',
    });
    expect(result.snapshot.dataMockProvision?.fixtures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentId: 'data-products',
          operationKind: 'query',
        }),
        expect.objectContaining({
          documentId: 'data-products',
          operationKind: 'mutation',
        }),
      ])
    );
    expect(JSON.stringify(result.snapshot.files)).not.toContain(
      'fixture-product'
    );
  });

  it('compiles PIR Data bindings into the standalone subscribed runtime', () => {
    const result = generateWorkspaceReactViteExecutableProject(
      workspaceWithData(),
      { dataMockProvision }
    );

    expect(
      result.status,
      result.status === 'blocked' ? JSON.stringify(result.diagnostics) : ''
    ).toBe('ready');
    if (result.status !== 'ready') return;
    const runtime = result.snapshot.files.find(
      ({ path }) => path === 'src/prodivix-data-runtime.ts'
    );
    const consoleRuntime = result.snapshot.files.find(
      ({ path }) => path === 'src/prodivix-console-runtime.ts'
    );
    const page = result.snapshot.files.find(({ path }) =>
      path.includes('components/page')
    );
    const entry = result.snapshot.files.find(
      ({ path }) => path === 'src/App.tsx'
    );
    expect(runtime?.contents).toContain('createWorkspaceDataRuntime');
    expect(runtime?.contents).toContain('list-products');
    expect(runtime?.contents).toContain('invokeLiveHttp');
    expect(runtime?.contents).toContain('prodivix.execution-network-bridge.v1');
    expect(runtime?.contents).toContain('dispatchDataMutation');
    expect(consoleRuntime?.contents).toContain(
      'prodivix.execution-console-bridge.v1'
    );
    expect(consoleRuntime?.contents).toContain('unhandledrejection');
    expect(consoleRuntime?.contents).toContain(
      'PRODIVIX_CONSOLE_MAX_BRIDGE_BYTES'
    );
    expect(consoleRuntime?.contents).toContain(
      'PRODIVIX_CONSOLE_REDACTION_MARKER'
    );
    expect(consoleRuntime?.contents).toContain('prodivixSensitiveConsoleKey');
    expect(consoleRuntime?.contents).toContain('redacted: budget.redacted');
    expect(page?.contents).toContain('subscribeDataLifecycle');
    expect(page?.contents).toContain('activateDataBindings');
    expect(page?.contents).toContain('dispatch-data-operation');
    expect(page?.contents).toContain('runtimeValuesById');
    expect(entry?.contents).toContain('workspaceDataRuntime');
    expect(entry?.contents).toContain("import './prodivix-console-runtime';");
    expect(entry?.contents).toContain('__pdxRouteId={match.routeNodeId}');
    expect(
      projectExecutableProjectRuntimeFiles(result.snapshot).find(
        ({ path }) => path === 'public/.prodivix/data-mock-provision.json'
      )?.contents
    ).toContain('fixture-product');
    expect(result.snapshot.capabilityRequirements.preview).not.toContain(
      'network'
    );
    expect(
      projectExecutableProjectRuntimeFiles(result.snapshot, 'preview').find(
        ({ path }) => path === 'public/.prodivix/data-runtime.json'
      )?.contents
    ).toContain('"mode":"mock"');
  });

  it('declares live Data network capability and runtime mode without mock provisioning', () => {
    const result =
      generateWorkspaceReactViteExecutableProject(workspaceWithData());
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.snapshot.capabilityRequirements.preview).toContain('network');
    expect(
      projectExecutableProjectRuntimeFiles(result.snapshot, 'preview').find(
        ({ path }) => path === 'public/.prodivix/data-runtime.json'
      )?.contents
    ).toContain('"mode":"live"');
  });
});
