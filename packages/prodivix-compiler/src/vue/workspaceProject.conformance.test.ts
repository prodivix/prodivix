import { describe, expect, it } from 'vitest';
import {
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectDataMockProvision,
} from '@prodivix/runtime-core';
import {
  decodeWorkspaceDataSourceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { generateWorkspaceReactViteBundle } from '#src/react/workspaceProject';
import { generateWorkspaceVueViteExecutableProject } from '#src/executableProject/workspaceVueExecutableProject';
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

describe('controlled Vue/Vite G2 target', () => {
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
