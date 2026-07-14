import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type {
  PIRCollectionNode,
  PIRComponentContract,
  PIRComponentInstanceNode,
  PIRDocument,
  PIRNode,
} from '@prodivix/pir';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from '../types';
import { applyWorkspaceTransaction } from '../workspaceCommand';
import {
  createWorkspaceCollectionInsertTransactionPlan,
  createWorkspaceCollectionUpdateTransactionPlan,
  createWorkspaceComponentInstanceBindingsUpdateTransactionPlan,
} from './workspaceComponentAuthoringTransaction';
import { decodeWorkspacePirDocument } from './workspacePirDocument';

const propertyParameters = Object.freeze({
  numRuns: 28,
  seed: 0x14_07_2026,
});

const contract: PIRComponentContract = {
  propsById: {
    'prop-title': {
      id: 'prop-title',
      name: 'Title',
      typeRef: 'string',
    },
  },
  eventsById: {},
  slotsById: {},
  variantAxesById: {},
};

const instance: PIRComponentInstanceNode = {
  id: 'instance-card',
  kind: 'component-instance',
  componentDocumentId: 'component-card',
  bindings: { props: {}, events: {}, variants: {} },
};

const createPage = (): PIRDocument => {
  const nodesById: Record<string, PIRNode> = {
    root: { id: 'root', kind: 'element', type: 'main' },
    [instance.id]: instance,
    item: { id: 'item', kind: 'element', type: 'article' },
    empty: { id: 'empty', kind: 'element', type: 'p' },
  };
  return {
    ui: {
      graph: {
        rootId: 'root',
        nodesById,
        childIdsById: {
          root: [instance.id, 'item', 'empty'],
          [instance.id]: [],
          item: [],
          empty: [],
        },
        order: { strategy: 'childIdsById' },
      },
    },
  };
};

const createComponent = (): PIRDocument => ({
  componentContract: contract,
  ui: {
    graph: {
      rootId: 'component-root',
      nodesById: {
        'component-root': {
          id: 'component-root',
          kind: 'element',
          type: 'article',
        },
      },
      childIdsById: { 'component-root': [] },
      order: { strategy: 'childIdsById' },
    },
  },
});

const workspaceDocument = (
  id: string,
  type: 'pir-page' | 'pir-component',
  path: string,
  content: PIRDocument
): WorkspaceDocument => ({
  id,
  type,
  name: id,
  path,
  contentRev: 1,
  metaRev: 1,
  content,
});

const createWorkspace = (): WorkspaceSnapshot => {
  const page = workspaceDocument(
    'page-home',
    'pir-page',
    '/home.pir.json',
    createPage()
  );
  const component = workspaceDocument(
    'component-card',
    'pir-component',
    '/card.pir.json',
    createComponent()
  );
  const treeById: Record<string, WorkspaceVfsNode> = {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node', 'component-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'root',
      docId: page.id,
    },
    'component-node': {
      id: 'component-node',
      kind: 'doc',
      name: 'card.pir.json',
      parentId: 'root',
      docId: component.id,
    },
  };
  return {
    id: 'workspace-node-authoring',
    workspaceRev: 9,
    routeRev: 2,
    opSeq: 4,
    treeRootId: 'root',
    treeById,
    docsById: { [page.id]: page, [component.id]: component },
    routeManifest: {
      version: '1',
      root: { id: 'route-root', pageDocId: page.id },
    },
    activeDocumentId: page.id,
    activeRouteNodeId: 'route-root',
  };
};

const applyReadyPlan = (
  workspace: WorkspaceSnapshot,
  result: ReturnType<
    | typeof createWorkspaceCollectionInsertTransactionPlan
    | typeof createWorkspaceCollectionUpdateTransactionPlan
    | typeof createWorkspaceComponentInstanceBindingsUpdateTransactionPlan
  >
): WorkspaceSnapshot => {
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') return workspace;
  const applied = applyWorkspaceTransaction(workspace, result.plan.transaction);
  expect(applied.ok).toBe(true);
  return applied.ok ? applied.snapshot : workspace;
};

const readPage = (workspace: WorkspaceSnapshot): PIRDocument => {
  const result = decodeWorkspacePirDocument(workspace.docsById['page-home']!, {
    workspaceId: workspace.id,
  });
  expect(result.status).toBe('valid');
  if (result.status !== 'valid')
    throw new Error('Expected canonical PIR page.');
  return result.decodedContent;
};

describe('Workspace canonical PIR node authoring transaction properties', () => {
  it('plans and applies Instance bindings plus Collection insert/update atomically', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 24 }), (title) => {
        let workspace = createWorkspace();
        workspace = applyReadyPlan(
          workspace,
          createWorkspaceComponentInstanceBindingsUpdateTransactionPlan({
            workspace,
            baseRevision: workspace.workspaceRev,
            transactionId: 'transaction-bindings',
            issuedAt: '2026-07-14T00:00:00.000Z',
            documentId: 'page-home',
            instanceNodeId: instance.id,
            bindings: {
              props: { 'prop-title': { kind: 'literal', value: title } },
              events: {},
              variants: {},
            },
          })
        );

        const collection: PIRCollectionNode = {
          id: 'collection-products',
          kind: 'collection',
          source: { kind: 'literal', value: [title] },
          key: { kind: 'index' },
          symbols: {
            itemId: 'product-item',
            itemName: 'product',
            indexId: 'product-index',
            indexName: 'index',
          },
        };
        workspace = applyReadyPlan(
          workspace,
          createWorkspaceCollectionInsertTransactionPlan({
            workspace,
            baseRevision: workspace.workspaceRev,
            transactionId: 'transaction-insert-collection',
            issuedAt: '2026-07-14T00:00:01.000Z',
            documentId: 'page-home',
            collection,
            placement: { parentId: 'root', index: 1 },
            regions: {
              item: ['item'],
              empty: ['empty'],
              loading: [],
              error: [],
            },
          })
        );

        workspace = applyReadyPlan(
          workspace,
          createWorkspaceCollectionUpdateTransactionPlan({
            workspace,
            baseRevision: workspace.workspaceRev,
            transactionId: 'transaction-update-collection',
            issuedAt: '2026-07-14T00:00:02.000Z',
            documentId: 'page-home',
            collection: {
              ...collection,
              source: { kind: 'literal', value: [title, title] },
              key: {
                kind: 'binding',
                value: {
                  kind: 'collection-symbol',
                  symbolId: collection.symbols.indexId,
                },
              },
            },
            regions: {
              item: ['empty'],
              empty: ['item'],
              loading: [],
              error: [],
            },
          })
        );

        const page = readPage(workspace);
        const updatedInstance = page.ui.graph.nodesById[instance.id];
        expect(updatedInstance?.kind).toBe('component-instance');
        if (updatedInstance?.kind === 'component-instance') {
          expect(updatedInstance.bindings.props['prop-title']).toEqual({
            kind: 'literal',
            value: title,
          });
        }
        expect(page.ui.graph.nodesById[collection.id]?.kind).toBe('collection');
        expect(page.ui.graph.regionsById?.[collection.id]).toEqual({
          item: ['empty'],
          empty: ['item'],
          loading: [],
          error: [],
        });
      }),
      propertyParameters
    );
  });
});
