import { createEmptyPirDocument } from '@prodivix/pir';
import type { WorkspaceSnapshot } from '@prodivix/workspace';

export const SERVER_DATA_SECRET_REFERENCE_CANARY =
  'runner-secret-reference-canary';

export const serverDataWorkspace: WorkspaceSnapshot = {
  id: 'runner-server-data',
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
      children: ['page-node', 'data-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'page.pir.json',
      parentId: 'root',
      docId: 'page',
    },
    'data-node': {
      id: 'data-node',
      kind: 'doc',
      name: 'data.json',
      parentId: 'root',
      docId: 'server-data',
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
    'server-data': {
      id: 'server-data',
      type: 'data-source',
      path: '/data.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        source: {
          id: 'server-data',
          adapterId: 'core.http',
          runtimeZone: 'server',
          bindingsById: {
            endpoint: {
              kind: 'environment-ref',
              reference: { bindingId: 'endpoint' },
            },
            [SERVER_DATA_SECRET_REFERENCE_CANARY]: {
              kind: 'secret-ref',
              reference: {
                bindingId: SERVER_DATA_SECRET_REFERENCE_CANARY,
              },
            },
          },
          configurationByKey: {
            baseUrl: {
              kind: 'environment-ref',
              reference: { bindingId: 'endpoint' },
            },
            authorization: {
              kind: 'secret-ref',
              reference: {
                bindingId: SERVER_DATA_SECRET_REFERENCE_CANARY,
              },
            },
          },
        },
        schemasById: {
          output: {
            id: 'output',
            schema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'array',
            },
          },
        },
        operationsById: {
          list: {
            id: 'list',
            kind: 'query',
            outputSchemaId: 'output',
            configurationByKey: {
              method: { kind: 'literal', value: 'GET' },
              path: { kind: 'literal', value: '/items' },
            },
            policies: {},
          },
        },
      },
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'root-route', pageDocId: 'page' },
  },
};
