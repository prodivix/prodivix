import { describe, expect, it } from 'vitest';
import type { PIRDocument } from '@prodivix/pir';
import type { PIRRenderLocation } from '@prodivix/pir-react-renderer';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  createCollectionInspectorModel,
  getCollectionInspectorBindingReadonlyReason,
} from './collectionInspectorModel';

const document: PIRDocument = {
  logic: {
    props: {
      records: { name: 'Records', typeRef: 'array', defaultValue: [] },
    },
    state: {
      selectedId: { typeRef: 'string', initial: '' },
    },
  },
  ui: {
    graph: {
      rootId: 'root',
      nodesById: {
        root: { id: 'root', kind: 'element', type: 'main' },
        collection: {
          id: 'collection',
          kind: 'collection',
          source: {
            kind: 'binding',
            value: { kind: 'param', paramId: 'records' },
          },
          key: {
            kind: 'binding',
            value: {
              kind: 'collection-symbol',
              symbolId: 'record-symbol',
              path: 'id',
            },
          },
          symbols: {
            itemId: 'record-symbol',
            itemName: 'record',
            indexId: 'record-index-symbol',
            indexName: 'recordIndex',
            errorId: 'record-error-symbol',
          },
        },
        'item-card': { id: 'item-card', kind: 'element', type: 'article' },
        'item-actions': {
          id: 'item-actions',
          kind: 'element',
          type: 'footer',
        },
        'empty-copy': { id: 'empty-copy', kind: 'element', type: 'p' },
        'loading-copy': {
          id: 'loading-copy',
          kind: 'element',
          type: 'output',
        },
        'error-copy': { id: 'error-copy', kind: 'element', type: 'strong' },
      },
      childIdsById: {
        root: ['collection'],
        collection: [],
        'item-card': [],
        'item-actions': [],
        'empty-copy': [],
        'loading-copy': [],
        'error-copy': [],
      },
      regionsById: {
        collection: {
          item: ['item-card', 'item-actions'],
          empty: ['empty-copy'],
          loading: ['loading-copy'],
          error: ['error-copy'],
        },
      },
      order: { strategy: 'childIdsById' },
    },
  },
};

const workspace: WorkspaceSnapshot = {
  id: 'workspace-collection',
  workspaceRev: 3,
  routeRev: 2,
  opSeq: 8,
  treeRootId: 'tree-root',
  treeById: {
    'tree-root': {
      id: 'tree-root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'collection.pir.json',
      parentId: 'tree-root',
      docId: 'page-collection',
    },
  },
  docsById: {
    'page-collection': {
      id: 'page-collection',
      type: 'pir-page',
      path: '/pages/collection.pir.json',
      contentRev: 4,
      metaRev: 1,
      content: document,
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root', pageDocId: 'page-collection' },
  },
};

const location: PIRRenderLocation = {
  documentId: 'page-collection',
  nodeId: 'collection',
  instancePath: 'page-collection/collection',
  role: 'source',
};

describe('Collection Inspector model', () => {
  it('projects typed Collection state, regions, and scope-aware candidates', () => {
    const result = createCollectionInspectorModel({ workspace, location });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const { model } = result;

    expect(model.source).toMatchObject({
      kind: 'binding',
      binding: { kind: 'param', paramId: 'records' },
      readOnly: false,
    });
    expect(model.key).toMatchObject({
      kind: 'binding',
      binding: {
        kind: 'collection-symbol',
        symbolId: 'record-symbol',
        path: 'id',
      },
      readOnly: true,
      readOnlyReason: 'complex-binding',
    });
    expect(model.symbols).toMatchObject({
      item: { id: 'record-symbol', name: 'record', editableName: true },
      index: {
        id: 'record-index-symbol',
        name: 'recordIndex',
        editableName: true,
      },
      error: {
        id: 'record-error-symbol',
        name: 'error',
        editableName: false,
      },
    });
    expect(model.regions.item).toMatchObject({
      count: 2,
      state: 'configured',
      nodes: [
        { id: 'item-card', kind: 'element', label: 'article' },
        { id: 'item-actions', kind: 'element', label: 'footer' },
      ],
    });
    expect(model.regions.empty.count).toBe(1);
    expect(model.regions.loading.count).toBe(1);
    expect(model.regions.error.count).toBe(1);

    expect(
      model.candidateScopes.source.candidates.map(({ binding }) => binding)
    ).toContainEqual({ kind: 'param', paramId: 'records' });
    expect(
      model.candidateScopes.source.candidates.some(({ local }) => local)
    ).toBe(false);
    expect(
      model.candidateScopes.key.candidates
        .filter(({ local }) => local)
        .map(({ binding }) => binding)
    ).toEqual([
      { kind: 'collection-symbol', symbolId: 'record-symbol' },
      { kind: 'collection-symbol', symbolId: 'record-index-symbol' },
    ]);
    expect(
      model.candidateScopes.error.candidates
        .filter(({ local }) => local)
        .map(({ binding }) => binding)
    ).toEqual([{ kind: 'collection-symbol', symbolId: 'record-error-symbol' }]);
  });

  it('keeps code-owned and path-based bindings read-only', () => {
    expect(
      getCollectionInspectorBindingReadonlyReason({
        kind: 'state',
        stateId: 'selectedId',
        path: 'nested.value',
      })
    ).toBe('complex-binding');
    expect(
      getCollectionInspectorBindingReadonlyReason({
        kind: 'param',
        paramId: 'records',
      })
    ).toBeUndefined();
  });
});
