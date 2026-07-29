import { describe, expect, it } from 'vitest';
import { encodeAnimationDefinition } from '@prodivix/animation';
import { encodeNodeGraphDocument } from '@prodivix/nodegraph';
import {
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectDataMockProvision,
} from '@prodivix/runtime-core';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  decodeWorkspaceDataSourceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { generateWorkspaceReactViteBundle } from '#src/react/workspaceProject';
import { generateWorkspaceVueViteExecutableProject } from '#src/executableProject/workspaceVueExecutableProject';
import type { ExportRouteTopology } from '#src/export';
import {
  DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
  type WorkspaceServerRuntimeTargetAnalysis,
} from '#src/workspace/workspaceServerRuntimeTarget';
import { createWorkspaceVueAppModule } from './workspaceApp';
import { generateWorkspaceVueViteBundle } from './workspaceProject';

const workspace: WorkspaceSnapshot = {
  id: 'vue-data-portability',
  name: 'Vue Data Portability',
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
      children: ['data-node'],
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
          product: {
            id: 'product',
            schema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'object',
            },
          },
          products: {
            id: 'products',
            schema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'array',
            },
          },
        },
        operationsById: {
          'list-products': {
            id: 'list-products',
            name: 'List products',
            kind: 'query',
            outputSchemaId: 'products',
            configurationByKey: {},
            policies: {},
          },
          'create-product': {
            id: 'create-product',
            name: 'Create product',
            kind: 'mutation',
            outputSchemaId: 'product',
            configurationByKey: {},
            policies: {},
          },
        },
      },
    },
  },
  routeManifest: { version: '1', root: { id: 'root-route' } },
};

const provision: ExecutableProjectDataMockProvision = {
  fixtureSetId: 'vue-data-portability',
  emulatedAdapterIds: ['core.http'],
  collections: [
    {
      id: 'products',
      entityIdKey: 'id',
      initialEntities: [{ id: 'p1', name: 'Alpha' }],
    },
  ],
  fixtures: [
    {
      id: 'list-products',
      documentId: 'data-products',
      operationId: 'list-products',
      operationKind: 'query',
      behavior: { kind: 'crud', collectionId: 'products', action: 'list' },
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
        valueInputKey: 'product',
      },
    },
  ],
};

const domainWorkspace: WorkspaceSnapshot = {
  ...workspace,
  treeById: {
    ...workspace.treeById,
    root: {
      ...workspace.treeById.root!,
      children: ['data-node', 'page-node', 'graph-node', 'animation-node'],
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
      name: 'catalog.pir-graph.json',
      parentId: 'root',
      docId: 'graph-catalog',
    },
    'animation-node': {
      id: 'animation-node',
      kind: 'doc',
      name: 'catalog.pir-animation.json',
      parentId: 'root',
      docId: 'animation-catalog',
    },
  },
  docsById: {
    ...workspace.docsById,
    page: {
      id: 'page',
      type: 'pir-page',
      path: '/page.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
    'graph-catalog': {
      id: 'graph-catalog',
      type: 'pir-graph',
      path: '/catalog.pir-graph.json',
      contentRev: 9,
      metaRev: 1,
      content: encodeNodeGraphDocument({
        nodes: [
          {
            id: 'start',
            descriptorRef: { id: 'core.start', version: '1' },
            ports: [
              {
                id: 'out.control.next',
                direction: 'output',
                flow: 'control',
                required: false,
                cardinality: 'single',
              },
              {
                id: 'out.data.value',
                direction: 'output',
                flow: 'data',
                typeRef: 'json',
                required: false,
                cardinality: 'single',
              },
            ],
            configuration: {},
            editor: {},
          },
          {
            id: 'end',
            descriptorRef: { id: 'core.end', version: '1' },
            ports: [
              {
                id: 'in.control.prev',
                direction: 'input',
                flow: 'control',
                required: true,
                cardinality: 'single',
              },
              {
                id: 'in.data.value',
                direction: 'input',
                flow: 'data',
                typeRef: 'json',
                required: true,
                cardinality: 'single',
              },
            ],
            configuration: {},
            editor: {},
          },
        ],
        edges: [
          {
            id: 'start-end-control',
            source: { nodeId: 'start', portId: 'out.control.next' },
            target: { nodeId: 'end', portId: 'in.control.prev' },
          },
          {
            id: 'start-end-data',
            source: { nodeId: 'start', portId: 'out.data.value' },
            target: { nodeId: 'end', portId: 'in.data.value' },
          },
        ],
      }),
    },
    'animation-catalog': {
      id: 'animation-catalog',
      type: 'pir-animation',
      path: '/catalog.pir-animation.json',
      contentRev: 1,
      metaRev: 1,
      content: encodeAnimationDefinition({
        target: { kind: 'pir-document', documentId: 'page' },
        timelines: [
          {
            id: 'catalog-enter',
            name: 'Catalog enter',
            durationMs: 120,
            motionIntent: 'decorative',
            reducedMotion: { kind: 'final-state' },
            markers: [],
            bindings: [],
          },
        ],
        compositions: [
          {
            id: 'catalog-composition',
            name: 'Catalog composition',
            motionIntent: 'decorative',
            root: {
              id: 'catalog-composition-root',
              kind: 'timeline-ref',
              timelineId: 'catalog-enter',
            },
          },
        ],
        entryCompositionId: 'catalog-composition',
      }),
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'root-route', pageDocId: 'page' },
  },
};

describe('controlled Vue/Vite G2 target', () => {
  it('wires protected product routes through the generated Server Runtime client', () => {
    const runtimeRefs = [
      {
        kind: 'guard' as const,
        artifactId: 'code-auth',
        exportName: 'requireOwner',
        sourceTrace: [],
      },
      {
        kind: 'loader' as const,
        artifactId: 'code-auth',
        exportName: 'loadPrincipal',
        sourceTrace: [],
      },
      {
        kind: 'action' as const,
        artifactId: 'code-auth',
        exportName: 'mutateCatalog',
        sourceTrace: [],
      },
    ];
    const routeTopology: ExportRouteTopology = {
      version: '1',
      rootRouteNodeId: 'route-auth',
      target: { framework: 'vue', preset: 'vite' },
      routes: [
        {
          routeNodeId: 'route-auth',
          path: '/',
          depth: 0,
          runtimeRefs,
          sourceTrace: [],
        },
      ],
      runtimeRefs: runtimeRefs.map((runtimeRef) => ({
        routeNodeId: 'route-auth',
        ...runtimeRef,
      })),
      adapter: {
        framework: 'vue',
        preset: 'vite',
        runtimeRefs: runtimeRefs.map(
          ({ sourceTrace: _sourceTrace, ...runtimeRef }) => ({
            routeNodeId: 'route-auth',
            ...runtimeRef,
          })
        ),
      },
    };
    const definition = (
      exportName: string,
      kind: 'route-guard' | 'route-loader' | 'route-action'
    ) => ({
      reference: { artifactId: 'code-auth', exportName },
      kind,
      runtimeZone: 'server' as const,
      adapterId:
        kind === 'route-guard'
          ? 'core.auth.require-workspace-owner'
          : kind === 'route-loader'
            ? 'core.auth.current-principal'
            : 'core.server.execution-state.put',
      effect:
        kind === 'route-action' ? ('mutation' as const) : ('read' as const),
      auth:
        kind === 'route-guard'
          ? ({
              kind: 'permission' as const,
              permissionId: 'workspace.owner',
            } as const)
          : ({ kind: 'authenticated' as const } as const),
      inputSchema: true,
      outputSchema: true,
      ...(kind === 'route-action'
        ? { idempotency: { kind: 'invocation-key' as const } }
        : {}),
    });
    const serverRuntime: WorkspaceServerRuntimeTargetAnalysis = {
      target: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
      serverArtifactIds: ['code-auth'],
      bindings: [
        {
          routeNodeId: 'route-auth',
          routeKind: 'guard',
          documentPath: '/auth.server.ts',
          definition: definition('requireOwner', 'route-guard'),
        },
        {
          routeNodeId: 'route-auth',
          routeKind: 'loader',
          documentPath: '/auth.server.ts',
          definition: definition('loadPrincipal', 'route-loader'),
        },
        {
          routeNodeId: 'route-auth',
          routeKind: 'action',
          documentPath: '/auth.server.ts',
          definition: definition('mutateCatalog', 'route-action'),
        },
      ],
      requirements: {
        functionCount: 3,
        routeNodeCount: 1,
        requiresServerGateway: true,
        requiresEnvironmentBinding: false,
        requiresProductAuth: false,
        requiresDeterministicTestRuntime: true,
      },
      diagnostics: [],
    };
    const result = createWorkspaceVueAppModule({
      workspace,
      routeTopology,
      serverRuntime,
      executableModuleIdByArtifactId: new Map(),
      compiledDocuments: [],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.module.body).toContain(
      'return invokeWorkspaceServerFunction('
    );
    expect(result.module.body).toContain(
      'createWorkspaceRouteInvocationOptions(options)'
    );
    expect(result.module.body).toContain(
      "readRuntimeEntry(route.routeNodeId, 'guard')"
    );
    expect(result.module.body).toContain(
      "readRuntimeEntry(route.routeNodeId, 'loader')"
    );
    expect(result.module.body).toContain('dispatchWorkspaceRouteAction');
    expect(result.module.body).toContain('data-prodivix-route-loader');
    expect(result.module.body).toContain(
      "'data-prodivix-route-runtime': 'denied'"
    );
  });

  it('uses the exact shared standalone Data runtime and independent Vue scaffold', () => {
    const vue = generateWorkspaceVueViteBundle(workspace, {
      dataMockProvision: provision,
    });
    const react = generateWorkspaceReactViteBundle(workspace, {
      dataMockProvision: provision,
    });
    expect(vue.target).toEqual({ framework: 'vue', preset: 'vite' });
    expect(vue.files.find(({ path }) => path === 'src/App.vue')).toBeTruthy();
    expect(vue.files.find(({ path }) => path === 'src/main.ts')).toBeTruthy();
    expect(
      vue.files.find(({ path }) => path === 'src/prodivix-entry-surface.css')
        ?.contents
    ).toContain('grid-template-rows: minmax(100dvh, auto)');
    expect(
      vue.files.find(({ path }) => path === 'src/main.ts')?.contents
    ).toContain("import './prodivix-entry-surface.css';");
    expect(
      vue.files.find(({ path }) => path === 'src/prodivix-data-runtime.ts')
        ?.contents
    ).toBe(
      react.files.find(({ path }) => path === 'src/prodivix-data-runtime.ts')
        ?.contents
    );
    expect(
      String(vue.files.find(({ path }) => path === 'src/App.test.ts')?.contents)
    ).toContain('runs the exact mock CRUD journey');
    expect(vue.metadata?.mockCrudJourney).toBe(true);
  });

  it('projects the Vue target through the same v6 snapshot and mock-only runtime assets', () => {
    const result = generateWorkspaceVueViteExecutableProject(workspace, {
      dataMockProvision: provision,
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.snapshot.target).toEqual({
      presetId: 'vue-vite',
      framework: 'vue',
      runtime: 'vite',
    });
    expect(result.snapshot.resourceHints.timeoutMs).toBe(60_000);
    expect(result.snapshot.dataMockProvision).toMatchObject({
      fixtureSetId: provision.fixtureSetId,
      emulatedAdapterIds: ['core.http'],
    });
    expect(result.snapshot.dataMockProvision?.fixtures).toHaveLength(2);
    expect(result.snapshot.capabilityRequirements.preview).not.toContain(
      'network'
    );
    expect(
      projectExecutableProjectRuntimeFiles(result.snapshot, 'preview').find(
        ({ path }) => path === 'public/.prodivix/data-runtime.json'
      )?.contents
    ).toContain('"mode":"mock"');
    expect(
      projectExecutableProjectRuntimeFiles(result.snapshot, 'test').find(
        ({ path }) => path === 'public/.prodivix/data-mock-provision.json'
      )?.contents
    ).toContain('vue-data-portability');
  });

  it.each(['core.graphql', 'core.asyncapi'] as const)(
    'keeps %s mock execution portable across React and Vue targets',
    (adapterId) => {
      const dataDocument = workspace.docsById['data-products']!;
      if (dataDocument.type !== 'data-source')
        throw new Error('Expected Data source fixture.');
      const protocolWorkspace: WorkspaceSnapshot = {
        ...workspace,
        docsById: {
          'data-products': {
            ...dataDocument,
            content: {
              ...dataDocument.content,
              source: { ...dataDocument.content.source, adapterId },
            },
          },
        },
      };
      const protocolProvision: ExecutableProjectDataMockProvision = {
        ...provision,
        emulatedAdapterIds: [adapterId],
      };
      const vue = generateWorkspaceVueViteExecutableProject(protocolWorkspace, {
        dataMockProvision: protocolProvision,
      });
      const react = generateWorkspaceReactViteBundle(protocolWorkspace, {
        dataMockProvision: protocolProvision,
      });
      expect(vue.status).toBe('ready');
      expect(
        react.diagnostics
          .filter(({ severity }) => severity === 'error')
          .map(({ code }) => code)
      ).toEqual(['WKS-EXPORT-ROUTES-EMPTY']);
      if (vue.status !== 'ready') return;
      expect(vue.snapshot.dataMockProvision?.emulatedAdapterIds).toEqual([
        adapterId,
      ]);
      const vueRuntime = vue.snapshot.files.find(
        ({ path }) => path === 'src/prodivix-data-runtime.ts'
      )?.contents;
      expect(vueRuntime).toBe(
        react.files.find(({ path }) => path === 'src/prodivix-data-runtime.ts')
          ?.contents
      );
    }
  );

  it('projects NodeGraph and Animation with the exact shared domain runtime helpers', () => {
    const vue = generateWorkspaceVueViteBundle(domainWorkspace, {
      dataMockProvision: provision,
    });
    const react = generateWorkspaceReactViteBundle(domainWorkspace, {
      dataMockProvision: provision,
    });
    expect(
      vue.diagnostics.filter(({ severity }) => severity === 'error')
    ).toEqual([]);
    const graphFile = vue.files.find(({ path }) =>
      path.includes('/logic/nodegraphs/')
    );
    const animationFile = vue.files.find(({ path }) =>
      path.includes('/animations/')
    );
    expect(graphFile?.contents).toContain('createNodeGraphExecutor');
    expect(graphFile?.contents).toContain('programDigest');
    expect(graphFile?.contents).toContain('"documentRevision": 9');
    expect(graphFile?.contents).not.toContain('context.definition');
    expect(graphFile?.sourceTrace).toContainEqual(
      expect.objectContaining({
        sourceRef: expect.objectContaining({ id: 'graph-catalog' }),
      })
    );
    expect(animationFile?.contents).toContain('catalog-enter');
    expect(
      vue.files.some(({ contents }) =>
        typeof contents === 'string'
          ? contents.includes('createAnimationCompositionController') &&
            contents.includes('ProgramBundle')
          : false
      )
    ).toBe(true);
    expect(animationFile?.sourceTrace).toContainEqual(
      expect.objectContaining({
        sourceRef: expect.objectContaining({ id: 'animation-catalog' }),
      })
    );
    for (const path of [
      'src/runtime/nodegraph-runtime.ts',
      'src/runtime/animation-runtime.ts',
    ]) {
      expect(vue.files.find((file) => file.path === path)?.contents).toBe(
        react.files.find((file) => file.path === path)?.contents
      );
    }
  });

  it('fails closed on server/Secret Data and unsupported authoring documents', () => {
    const source = workspace.docsById['data-products']!;
    const decodedSource = decodeWorkspaceDataSourceDocument(source);
    if (decodedSource.status !== 'valid')
      throw new Error('Expected valid Data source fixture.');
    const serverWorkspace: WorkspaceSnapshot = {
      ...workspace,
      docsById: {
        'data-products': {
          ...source,
          content: {
            ...decodedSource.decodedContent,
            source: {
              ...decodedSource.decodedContent.source,
              runtimeZone: 'server',
              bindingsById: {
                token: {
                  kind: 'secret-ref',
                  reference: { bindingId: 'products-token' },
                },
              },
              configurationByKey: {},
            },
          },
        },
      },
    };
    const server = generateWorkspaceVueViteExecutableProject(serverWorkspace);
    expect(server.status).toBe('blocked');
    if (server.status === 'blocked')
      expect(
        server.diagnostics.some(({ severity }) => severity === 'error')
      ).toBe(true);

    const unsupported = generateWorkspaceVueViteBundle({
      ...workspace,
      treeById: {
        ...workspace.treeById,
        root: {
          ...workspace.treeById.root!,
          kind: 'dir',
          children: ['data-node', 'code-node'],
        },
        'code-node': {
          id: 'code-node',
          kind: 'doc',
          name: 'server.ts',
          parentId: 'root',
          docId: 'code-server',
        },
      },
      docsById: {
        ...workspace.docsById,
        'code-server': {
          id: 'code-server',
          type: 'code',
          path: '/server.ts',
          contentRev: 1,
          metaRev: 1,
          content: { language: 'typescript', source: 'export const x = 1;' },
        },
      },
    });
    expect(
      unsupported.diagnostics.some(
        ({ code }) => code === 'VUE-TARGET-DOCUMENT-UNSUPPORTED'
      )
    ).toBe(true);
  });
});
