import {
  createBinaryAssetBlobReference,
  createBinaryAssetMaterialization,
} from '@prodivix/assets';
import type { ExecutableProjectDataMockProvision } from '@prodivix/runtime-core';
import type { ServerRuntimeTestProvision } from '@prodivix/server-runtime';
import {
  DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
  EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET,
  EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
  PROVIDER_MOCK_DATA_RUNTIME_TARGET,
  generateWorkspaceVueViteExecutableProject,
} from '@prodivix/prodivix-compiler';
import {
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import type { PIRDocument } from '@prodivix/pir';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type { GoldenGeneratedProjectBundle } from './generatedProjectHarness';

export const GOLDEN_G2_VUE_CATALOG_SERVER_SOURCE_CANARY =
  'vue-catalog-server-source-must-never-enter-client-output' as const;

export const GOLDEN_G2_VUE_CATALOG_IDS = Object.freeze({
  workspace: 'golden-g2-vue-catalog',
  shellRoute: 'route-catalog-shell',
  route: 'route-catalog',
  page: 'page-catalog',
  layout: 'layout-catalog-shell',
  sidebar: 'page-catalog-sidebar',
  data: 'data-catalog',
  server: 'code-catalog-server',
  auth: 'config-catalog-auth',
  asset: 'asset-catalog-product',
  guard: 'requireCatalogOwner',
  loader: 'loadCatalogPrincipal',
  action: 'mutateCatalog',
});

const PRODUCT_PNG_BYTES = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  )
);

const PRODUCT_ASSET_REFERENCE = createBinaryAssetBlobReference({
  contents: PRODUCT_PNG_BYTES,
  mediaType: 'image/png',
});

export const GOLDEN_G2_VUE_CATALOG_ASSET_MATERIALIZATIONS = Object.freeze([
  createBinaryAssetMaterialization({
    assetDocumentId: GOLDEN_G2_VUE_CATALOG_IDS.asset,
    reference: PRODUCT_ASSET_REFERENCE,
    contents: PRODUCT_PNG_BYTES,
  }),
]);

const catalogLayoutPir = (): PIRDocument => ({
  metadata: {
    name: 'CatalogShell',
    description: 'Canonical Vue Catalog layout with default and named outlets.',
  },
  ui: {
    graph: {
      rootId: 'catalog-shell',
      nodesById: {
        'catalog-shell': {
          id: 'catalog-shell',
          kind: 'element',
          type: 'div',
          props: {
            'data-testid': { kind: 'literal', value: 'catalog-shell' },
          },
        },
        'catalog-shell-title': {
          id: 'catalog-shell-title',
          kind: 'element',
          type: 'header',
          text: { kind: 'literal', value: 'Catalog Shell' },
        },
        'catalog-sidebar': {
          id: 'catalog-sidebar',
          kind: 'element',
          type: 'aside',
          props: {
            'data-testid': { kind: 'literal', value: 'catalog-sidebar' },
          },
        },
        'catalog-sidebar-outlet': {
          id: 'catalog-sidebar-outlet',
          kind: 'element',
          type: 'p',
          text: { kind: 'literal', value: 'Sidebar fallback' },
        },
        'catalog-main': {
          id: 'catalog-main',
          kind: 'element',
          type: 'main',
          props: {
            'data-testid': { kind: 'literal', value: 'catalog-main' },
          },
        },
        'catalog-default-outlet': {
          id: 'catalog-default-outlet',
          kind: 'element',
          type: 'p',
          text: { kind: 'literal', value: 'Catalog fallback' },
        },
      },
      childIdsById: {
        'catalog-shell': [
          'catalog-shell-title',
          'catalog-sidebar',
          'catalog-main',
        ],
        'catalog-shell-title': [],
        'catalog-sidebar': ['catalog-sidebar-outlet'],
        'catalog-sidebar-outlet': [],
        'catalog-main': ['catalog-default-outlet'],
        'catalog-default-outlet': [],
      },
      regionsById: {},
      order: { strategy: 'childIdsById' },
    },
  },
});

const catalogSidebarPir = (): PIRDocument => ({
  metadata: {
    name: 'CatalogSidebar',
    description: 'Named Route outlet content for the authenticated Catalog.',
  },
  ui: {
    graph: {
      rootId: 'catalog-sidebar-page',
      nodesById: {
        'catalog-sidebar-page': {
          id: 'catalog-sidebar-page',
          kind: 'element',
          type: 'nav',
          props: {
            'aria-label': { kind: 'literal', value: 'Catalog sections' },
            'data-testid': {
              kind: 'literal',
              value: 'catalog-sidebar-page',
            },
          },
          text: { kind: 'literal', value: 'Featured products' },
        },
      },
      childIdsById: { 'catalog-sidebar-page': [] },
      regionsById: {},
      order: { strategy: 'childIdsById' },
    },
  },
});

const catalogPir = (): PIRDocument => ({
  metadata: {
    name: 'AuthenticatedCatalog',
    description:
      'Authenticated Catalog CRUD Golden for the Vue product target.',
  },
  logic: {
    dataById: {
      products: {
        operation: {
          documentId: GOLDEN_G2_VUE_CATALOG_IDS.data,
          operationId: 'list-products',
        },
        input: { kind: 'literal', value: {} },
        activations: [
          { kind: 'route', routeId: GOLDEN_G2_VUE_CATALOG_IDS.route },
        ],
      },
    },
  },
  ui: {
    graph: {
      rootId: 'catalog-root',
      nodesById: {
        'catalog-root': {
          id: 'catalog-root',
          kind: 'element',
          type: 'main',
          props: {
            className: { kind: 'literal', value: 'catalog' },
            'data-testid': { kind: 'literal', value: 'catalog' },
          },
        },
        'catalog-title': {
          id: 'catalog-title',
          kind: 'element',
          type: 'h1',
          text: { kind: 'literal', value: 'Authenticated Catalog' },
        },
        'catalog-image': {
          id: 'catalog-image',
          kind: 'element',
          type: 'img',
          props: {
            src: { kind: 'literal', value: '/catalog/product.png' },
            alt: { kind: 'literal', value: 'Catalog product' },
            width: { kind: 'literal', value: 1 },
            height: { kind: 'literal', value: 1 },
            'data-testid': { kind: 'literal', value: 'catalog-image' },
          },
        },
        products: {
          id: 'products',
          kind: 'collection',
          source: {
            kind: 'binding',
            value: { kind: 'data', dataId: 'products' },
          },
          key: {
            kind: 'binding',
            value: {
              kind: 'collection-symbol',
              symbolId: 'product',
              path: 'id',
            },
          },
          lifecycle: {
            kind: 'data-operation',
            dataId: 'products',
            idle: 'loading',
          },
          symbols: {
            itemId: 'product',
            itemName: 'product',
            indexId: 'product-index',
            indexName: 'productIndex',
            errorId: 'products-error',
          },
        },
        'product-card': {
          id: 'product-card',
          kind: 'element',
          type: 'article',
          props: {
            'data-testid': { kind: 'literal', value: 'product-card' },
          },
          text: {
            kind: 'collection-symbol',
            symbolId: 'product',
            path: 'name',
          },
        },
        'products-loading': {
          id: 'products-loading',
          kind: 'element',
          type: 'p',
          props: { role: { kind: 'literal', value: 'status' } },
          text: { kind: 'literal', value: 'Loading catalog' },
        },
        'products-empty': {
          id: 'products-empty',
          kind: 'element',
          type: 'p',
          text: { kind: 'literal', value: 'Catalog is empty' },
        },
        'products-error-label': {
          id: 'products-error-label',
          kind: 'element',
          type: 'p',
          props: { role: { kind: 'literal', value: 'alert' } },
          text: {
            kind: 'collection-symbol',
            symbolId: 'products-error',
            path: 'code',
          },
        },
        'create-product': {
          id: 'create-product',
          kind: 'element',
          type: 'button',
          props: {
            type: { kind: 'literal', value: 'button' },
            'data-testid': { kind: 'literal', value: 'create-product' },
          },
          text: { kind: 'literal', value: 'Create product' },
          events: {
            click: {
              kind: 'dispatch-data-operation',
              operation: {
                documentId: GOLDEN_G2_VUE_CATALOG_IDS.data,
                operationId: 'create-product',
              },
              input: {
                kind: 'literal',
                value: { product: { id: 'p2', name: 'Beta' } },
              },
            },
          },
        },
        'update-product': {
          id: 'update-product',
          kind: 'element',
          type: 'button',
          props: {
            type: { kind: 'literal', value: 'button' },
            'data-testid': { kind: 'literal', value: 'update-product' },
          },
          text: { kind: 'literal', value: 'Update product' },
          events: {
            click: {
              kind: 'dispatch-data-operation',
              operation: {
                documentId: GOLDEN_G2_VUE_CATALOG_IDS.data,
                operationId: 'update-product',
              },
              input: {
                kind: 'literal',
                value: { id: 'p2', patch: { name: 'Beta Updated' } },
              },
            },
          },
        },
        'delete-product': {
          id: 'delete-product',
          kind: 'element',
          type: 'button',
          props: {
            type: { kind: 'literal', value: 'button' },
            'data-testid': { kind: 'literal', value: 'delete-product' },
          },
          text: { kind: 'literal', value: 'Delete product' },
          events: {
            click: {
              kind: 'dispatch-data-operation',
              operation: {
                documentId: GOLDEN_G2_VUE_CATALOG_IDS.data,
                operationId: 'delete-product',
              },
              input: { kind: 'literal', value: { id: 'p2' } },
            },
          },
        },
      },
      childIdsById: {
        'catalog-root': [
          'catalog-title',
          'catalog-image',
          'products',
          'create-product',
          'update-product',
          'delete-product',
        ],
        'catalog-title': [],
        'catalog-image': [],
        products: [],
        'product-card': [],
        'products-loading': [],
        'products-empty': [],
        'products-error-label': [],
        'create-product': [],
        'update-product': [],
        'delete-product': [],
      },
      regionsById: {
        products: {
          item: ['product-card'],
          loading: ['products-loading'],
          empty: ['products-empty'],
          error: ['products-error-label'],
        },
      },
      order: { strategy: 'childIdsById' },
    },
  },
});

const routeInputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: Object.freeze(['routeId']),
  properties: Object.freeze({ routeId: Object.freeze({ type: 'string' }) }),
});

const serverProfiles = Object.freeze({
  [GOLDEN_G2_VUE_CATALOG_IDS.guard]: Object.freeze({
    kind: 'route-guard' as const,
    runtimeZone: 'server' as const,
    adapterId: 'core.auth.require-workspace-owner',
    effect: 'read' as const,
    auth: Object.freeze({
      kind: 'permission' as const,
      permissionId: 'workspace.owner',
    }),
    inputSchema: routeInputSchema,
    outputSchema: true,
  }),
  [GOLDEN_G2_VUE_CATALOG_IDS.loader]: Object.freeze({
    kind: 'route-loader' as const,
    runtimeZone: 'server' as const,
    adapterId: 'core.auth.current-principal',
    effect: 'read' as const,
    auth: Object.freeze({ kind: 'authenticated' as const }),
    inputSchema: routeInputSchema,
    outputSchema: true,
  }),
  [GOLDEN_G2_VUE_CATALOG_IDS.action]: Object.freeze({
    kind: 'route-action' as const,
    runtimeZone: 'server' as const,
    adapterId: 'core.server.execution-state.put',
    effect: 'mutation' as const,
    auth: Object.freeze({ kind: 'authenticated' as const }),
    inputSchema: true,
    outputSchema: true,
    idempotency: Object.freeze({ kind: 'invocation-key' as const }),
  }),
});

export const GOLDEN_G2_VUE_CATALOG_WORKSPACE: WorkspaceSnapshot = {
  id: GOLDEN_G2_VUE_CATALOG_IDS.workspace,
  name: 'Authenticated Vue Catalog',
  workspaceRev: 8,
  routeRev: 4,
  opSeq: 14,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: [
        'page-node',
        'layout-node',
        'sidebar-node',
        'data-node',
        'server-node',
        'config-dir',
        'public-root',
      ],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'catalog.pir.json',
      parentId: 'root',
      docId: GOLDEN_G2_VUE_CATALOG_IDS.page,
    },
    'layout-node': {
      id: 'layout-node',
      kind: 'doc',
      name: 'catalog.layout.pir.json',
      parentId: 'root',
      docId: GOLDEN_G2_VUE_CATALOG_IDS.layout,
    },
    'sidebar-node': {
      id: 'sidebar-node',
      kind: 'doc',
      name: 'catalog-sidebar.pir.json',
      parentId: 'root',
      docId: GOLDEN_G2_VUE_CATALOG_IDS.sidebar,
    },
    'data-node': {
      id: 'data-node',
      kind: 'doc',
      name: 'catalog.data.json',
      parentId: 'root',
      docId: GOLDEN_G2_VUE_CATALOG_IDS.data,
    },
    'server-node': {
      id: 'server-node',
      kind: 'doc',
      name: 'catalog.server.ts',
      parentId: 'root',
      docId: GOLDEN_G2_VUE_CATALOG_IDS.server,
    },
    'config-dir': {
      id: 'config-dir',
      kind: 'dir',
      name: 'config',
      parentId: 'root',
      children: ['auth-node'],
    },
    'auth-node': {
      id: 'auth-node',
      kind: 'doc',
      name: 'auth.json',
      parentId: 'config-dir',
      docId: GOLDEN_G2_VUE_CATALOG_IDS.auth,
    },
    'public-root': {
      id: 'public-root',
      kind: 'dir',
      name: 'public',
      parentId: 'root',
      children: ['public-dir'],
    },
    'public-dir': {
      id: 'public-dir',
      kind: 'dir',
      name: 'catalog',
      parentId: 'public-root',
      children: ['asset-node'],
    },
    'asset-node': {
      id: 'asset-node',
      kind: 'doc',
      name: 'product.png',
      parentId: 'public-dir',
      docId: GOLDEN_G2_VUE_CATALOG_IDS.asset,
    },
  },
  docsById: {
    [GOLDEN_G2_VUE_CATALOG_IDS.layout]: {
      id: GOLDEN_G2_VUE_CATALOG_IDS.layout,
      type: 'pir-layout',
      name: 'Catalog Shell',
      path: '/catalog.layout.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: catalogLayoutPir(),
    },
    [GOLDEN_G2_VUE_CATALOG_IDS.sidebar]: {
      id: GOLDEN_G2_VUE_CATALOG_IDS.sidebar,
      type: 'pir-page',
      name: 'Catalog Sidebar',
      path: '/catalog-sidebar.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: catalogSidebarPir(),
    },
    [GOLDEN_G2_VUE_CATALOG_IDS.page]: {
      id: GOLDEN_G2_VUE_CATALOG_IDS.page,
      type: 'pir-page',
      name: 'Catalog',
      path: '/catalog.pir.json',
      contentRev: 4,
      metaRev: 1,
      content: catalogPir(),
    },
    [GOLDEN_G2_VUE_CATALOG_IDS.data]: {
      id: GOLDEN_G2_VUE_CATALOG_IDS.data,
      type: 'data-source',
      name: 'Catalog Data',
      path: '/catalog.data.json',
      contentRev: 5,
      metaRev: 1,
      content: {
        source: {
          id: 'catalog',
          adapterId: 'core.http',
          runtimeZone: 'server',
          bindingsById: {},
          configurationByKey: {
            baseUrl: {
              kind: 'literal',
              value: 'https://catalog.example.test/',
            },
          },
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
            configurationByKey: {
              method: { kind: 'literal', value: 'GET' },
              path: { kind: 'literal', value: '/products' },
              emptyWhen: { kind: 'literal', value: 'never' },
            },
            policies: {},
          },
          'create-product': {
            id: 'create-product',
            name: 'Create product',
            kind: 'mutation',
            outputSchemaId: 'product',
            configurationByKey: {
              method: { kind: 'literal', value: 'POST' },
              path: { kind: 'literal', value: '/products' },
              bodyInputPath: { kind: 'literal', value: '/product' },
              idempotencyHeader: {
                kind: 'literal',
                value: 'idempotency-key',
              },
            },
            policies: { idempotency: { kind: 'invocation-key' } },
          },
          'get-product': {
            id: 'get-product',
            name: 'Get product',
            kind: 'query',
            outputSchemaId: 'product',
            configurationByKey: {
              method: { kind: 'literal', value: 'GET' },
              path: { kind: 'literal', value: '/products/{id}' },
              parameterMappings: {
                kind: 'literal',
                value: { path: { id: '/id' } },
              },
              emptyWhen: { kind: 'literal', value: 'never' },
            },
            policies: {},
          },
          'update-product': {
            id: 'update-product',
            name: 'Update product',
            kind: 'mutation',
            outputSchemaId: 'product',
            configurationByKey: {
              method: { kind: 'literal', value: 'PUT' },
              path: { kind: 'literal', value: '/products/{id}' },
              parameterMappings: {
                kind: 'literal',
                value: { path: { id: '/id' } },
              },
              bodyInputPath: { kind: 'literal', value: '/patch' },
              idempotencyHeader: {
                kind: 'literal',
                value: 'idempotency-key',
              },
            },
            policies: { idempotency: { kind: 'invocation-key' } },
          },
          'delete-product': {
            id: 'delete-product',
            name: 'Delete product',
            kind: 'mutation',
            outputSchemaId: 'product',
            configurationByKey: {
              method: { kind: 'literal', value: 'DELETE' },
              path: { kind: 'literal', value: '/products/{id}' },
              parameterMappings: {
                kind: 'literal',
                value: { path: { id: '/id' } },
              },
              idempotencyHeader: {
                kind: 'literal',
                value: 'idempotency-key',
              },
            },
            policies: { idempotency: { kind: 'invocation-key' } },
          },
        },
      },
    },
    [GOLDEN_G2_VUE_CATALOG_IDS.server]: {
      id: GOLDEN_G2_VUE_CATALOG_IDS.server,
      type: 'code',
      name: 'catalog.server.ts',
      path: '/catalog.server.ts',
      contentRev: 3,
      metaRev: 2,
      content: {
        language: 'ts',
        source: `const serverBoundary = '${GOLDEN_G2_VUE_CATALOG_SERVER_SOURCE_CANARY}';
void serverBoundary;
export const requireCatalogOwner = () => ({ kind: 'allow' as const });
export const loadCatalogPrincipal = () => ({ kind: 'value' as const, value: { displayName: 'Golden Owner' } });
export const mutateCatalog = () => ({ kind: 'value' as const, value: { committed: true } });
`,
        metadata: {
          'prodivix.serverRuntime': {
            schemaVersion: '1.0',
            functionsByExport: serverProfiles,
          },
        },
      },
    },
    [GOLDEN_G2_VUE_CATALOG_IDS.auth]: {
      id: GOLDEN_G2_VUE_CATALOG_IDS.auth,
      type: 'project-config',
      name: 'auth.json',
      path: '/config/auth.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        kind: 'config',
        value: {
          schemaVersion: '1.0',
          providerId: 'prodivix-product-session',
          permissionIds: ['workspace.owner'],
        },
      },
    },
    [GOLDEN_G2_VUE_CATALOG_IDS.asset]: {
      id: GOLDEN_G2_VUE_CATALOG_IDS.asset,
      type: 'asset',
      name: 'product.png',
      path: '/public/catalog/product.png',
      contentRev: 2,
      metaRev: 1,
      content: {
        kind: 'asset',
        mime: 'image/png',
        category: 'image',
        size: PRODUCT_ASSET_REFERENCE.byteLength,
        blob: PRODUCT_ASSET_REFERENCE,
      },
    },
  },
  routeManifest: {
    version: '1',
    root: {
      id: 'root',
      children: [
        {
          id: GOLDEN_G2_VUE_CATALOG_IDS.shellRoute,
          layoutDocId: GOLDEN_G2_VUE_CATALOG_IDS.layout,
          outletNodeId: 'catalog-default-outlet',
          outletBindings: {
            sidebar: {
              outletNodeId: 'catalog-sidebar-outlet',
              pageDocId: GOLDEN_G2_VUE_CATALOG_IDS.sidebar,
            },
          },
          children: [
            {
              id: GOLDEN_G2_VUE_CATALOG_IDS.route,
              index: true,
              pageDocId: GOLDEN_G2_VUE_CATALOG_IDS.page,
              runtime: {
                guardRef: {
                  artifactId: GOLDEN_G2_VUE_CATALOG_IDS.server,
                  exportName: GOLDEN_G2_VUE_CATALOG_IDS.guard,
                },
                loaderRef: {
                  artifactId: GOLDEN_G2_VUE_CATALOG_IDS.server,
                  exportName: GOLDEN_G2_VUE_CATALOG_IDS.loader,
                },
                actionRef: {
                  artifactId: GOLDEN_G2_VUE_CATALOG_IDS.server,
                  exportName: GOLDEN_G2_VUE_CATALOG_IDS.action,
                },
              },
            },
          ],
        },
      ],
    },
  },
};

export const GOLDEN_G2_VUE_CATALOG_DATA_PROVISION: ExecutableProjectDataMockProvision =
  Object.freeze({
    fixtureSetId: 'golden-g2-vue-catalog-crud',
    emulatedAdapterIds: Object.freeze(['core.http']),
    collections: Object.freeze([
      Object.freeze({
        id: 'products',
        entityIdKey: 'id',
        initialEntities: Object.freeze([
          Object.freeze({ id: 'p1', name: 'Alpha' }),
        ]),
      }),
    ]),
    fixtures: Object.freeze([
      Object.freeze({
        id: 'list-products',
        documentId: GOLDEN_G2_VUE_CATALOG_IDS.data,
        operationId: 'list-products',
        operationKind: 'query' as const,
        behavior: Object.freeze({
          kind: 'crud' as const,
          collectionId: 'products',
          action: 'list' as const,
        }),
      }),
      Object.freeze({
        id: 'create-product',
        documentId: GOLDEN_G2_VUE_CATALOG_IDS.data,
        operationId: 'create-product',
        operationKind: 'mutation' as const,
        behavior: Object.freeze({
          kind: 'crud' as const,
          collectionId: 'products',
          action: 'create' as const,
          valueInputKey: 'product',
        }),
      }),
      Object.freeze({
        id: 'get-product',
        documentId: GOLDEN_G2_VUE_CATALOG_IDS.data,
        operationId: 'get-product',
        operationKind: 'query' as const,
        behavior: Object.freeze({
          kind: 'crud' as const,
          collectionId: 'products',
          action: 'get' as const,
          idInputKey: 'id',
        }),
      }),
      Object.freeze({
        id: 'update-product',
        documentId: GOLDEN_G2_VUE_CATALOG_IDS.data,
        operationId: 'update-product',
        operationKind: 'mutation' as const,
        behavior: Object.freeze({
          kind: 'crud' as const,
          collectionId: 'products',
          action: 'update' as const,
          idInputKey: 'id',
          valueInputKey: 'patch',
        }),
      }),
      Object.freeze({
        id: 'delete-product',
        documentId: GOLDEN_G2_VUE_CATALOG_IDS.data,
        operationId: 'delete-product',
        operationKind: 'mutation' as const,
        behavior: Object.freeze({
          kind: 'crud' as const,
          collectionId: 'products',
          action: 'delete' as const,
          idInputKey: 'id',
        }),
      }),
    ]),
  });

export const GOLDEN_G2_VUE_CATALOG_SERVER_PROVISION: ServerRuntimeTestProvision =
  Object.freeze({
    format: 'prodivix.server-runtime-test-provision.v1',
    fixtureSetId: 'golden-g2-vue-catalog-authenticated',
    principal: Object.freeze({
      providerId: 'prodivix-product-session',
      principalId: 'golden-catalog-owner',
    }),
    permissions: Object.freeze([
      Object.freeze({ permissionId: 'workspace.owner', allowed: true }),
    ]),
    fixtures: Object.freeze([
      Object.freeze({
        id: 'catalog-owner-guard',
        functionRef: Object.freeze({
          artifactId: GOLDEN_G2_VUE_CATALOG_IDS.server,
          exportName: GOLDEN_G2_VUE_CATALOG_IDS.guard,
        }),
        input: Object.freeze({ routeId: GOLDEN_G2_VUE_CATALOG_IDS.route }),
        behavior: Object.freeze({
          kind: 'outcome' as const,
          outcome: Object.freeze({ kind: 'allow' as const }),
        }),
      }),
      Object.freeze({
        id: 'catalog-principal-loader',
        functionRef: Object.freeze({
          artifactId: GOLDEN_G2_VUE_CATALOG_IDS.server,
          exportName: GOLDEN_G2_VUE_CATALOG_IDS.loader,
        }),
        input: Object.freeze({ routeId: GOLDEN_G2_VUE_CATALOG_IDS.route }),
        behavior: Object.freeze({
          kind: 'outcome' as const,
          outcome: Object.freeze({
            kind: 'value' as const,
            value: Object.freeze({ displayName: 'Golden Owner' }),
          }),
        }),
      }),
      Object.freeze({
        id: 'catalog-mutation-action',
        functionRef: Object.freeze({
          artifactId: GOLDEN_G2_VUE_CATALOG_IDS.server,
          exportName: GOLDEN_G2_VUE_CATALOG_IDS.action,
        }),
        behavior: Object.freeze({
          kind: 'outcome' as const,
          outcome: Object.freeze({
            kind: 'value' as const,
            value: Object.freeze({ committed: true }),
          }),
        }),
      }),
    ]),
  });

export const createGoldenG2VueCatalogTestSnapshot =
  (): ExecutableProjectSnapshot => {
    const result = generateWorkspaceVueViteExecutableProject(
      GOLDEN_G2_VUE_CATALOG_WORKSPACE,
      {
        projectName: 'Authenticated Vue Catalog',
        dataRuntimeTarget: PROVIDER_MOCK_DATA_RUNTIME_TARGET,
        dataMockProvision: GOLDEN_G2_VUE_CATALOG_DATA_PROVISION,
        serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
        serverRuntimeMockProvision: GOLDEN_G2_VUE_CATALOG_SERVER_PROVISION,
        assetMaterializations: GOLDEN_G2_VUE_CATALOG_ASSET_MATERIALIZATIONS,
      }
    );
    if (result.status === 'blocked')
      throw new Error(
        `Golden Vue Catalog Test target is blocked: ${JSON.stringify(result.diagnostics)}`
      );
    return result.snapshot;
  };

export const createGoldenG2VueCatalogRemoteSnapshot =
  (): ExecutableProjectSnapshot => {
    const result = generateWorkspaceVueViteExecutableProject(
      GOLDEN_G2_VUE_CATALOG_WORKSPACE,
      {
        projectName: 'Authenticated Vue Catalog',
        dataRuntimeTarget: EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET,
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
        assetMaterializations: GOLDEN_G2_VUE_CATALOG_ASSET_MATERIALIZATIONS,
      }
    );
    if (result.status === 'blocked')
      throw new Error(
        `Golden Vue Catalog Remote target is blocked: ${JSON.stringify(result.diagnostics)}`
      );
    return result.snapshot;
  };

export const createGoldenG2VueCatalogProjectedBundle =
  (): GoldenGeneratedProjectBundle => {
    const snapshot = createGoldenG2VueCatalogTestSnapshot();
    return Object.freeze({
      files: projectExecutableProjectRuntimeFiles(snapshot, 'test'),
    });
  };

export const createGoldenG2VueCatalogRemoteProjectedBundle =
  (): GoldenGeneratedProjectBundle => {
    const snapshot = createGoldenG2VueCatalogRemoteSnapshot();
    return Object.freeze({
      files: projectExecutableProjectRuntimeFiles(snapshot, 'preview'),
    });
  };
