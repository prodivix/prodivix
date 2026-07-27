import { transformWithEsbuild } from 'vite';
import { describe, expect, it } from 'vitest';
import { reactCompileTarget } from '#src/react/target';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PIRComponentContract, PIRDocument, PIRNode } from '@prodivix/pir';
import {
  appendPirProjectionCollectionItemPath,
  appendPirProjectionComponentPath,
  appendPirProjectionSlotPath,
  createPirCollectionKeyIdentity,
  createPirProjectionRootPath,
} from '@prodivix/pir';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from '@prodivix/workspace';
import { compileWorkspacePirReactModules } from '#src/workspace/pirWorkspaceCompiler';
import {
  evaluateGeneratedModules,
  typecheckGeneratedModule,
} from '#src/workspace/__tests__/generatedModuleHarness';

const emptyContract = (): PIRComponentContract => ({
  propsById: {},
  eventsById: {},
  slotsById: {},
  variantAxesById: {},
});

const createDocument = (
  id: string,
  type: 'pir-page' | 'pir-component',
  content: PIRDocument
): WorkspaceDocument => ({
  id,
  type,
  path: `/${id}.pir.json`,
  contentRev: 1,
  metaRev: 1,
  content,
});

const createWorkspace = (
  documents: readonly WorkspaceDocument[]
): WorkspaceSnapshot => {
  const treeById: Record<string, WorkspaceVfsNode> = {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: documents.map(({ id }) => `node-${id}`),
    },
  };
  for (const document of documents) {
    treeById[`node-${document.id}`] = {
      id: `node-${document.id}`,
      kind: 'doc',
      name: `${document.id}.pir.json`,
      parentId: 'root',
      docId: document.id,
    };
  }
  return {
    id: 'compiler-current-collection',
    workspaceRev: 21,
    routeRev: 1,
    opSeq: 4,
    treeRootId: 'root',
    treeById,
    docsById: Object.fromEntries(
      documents.map((document) => [document.id, document])
    ),
    routeManifest: { version: '1', root: { id: 'route-root' } },
  };
};

const createCardDefinition = (): WorkspaceDocument => {
  const contract: PIRComponentContract = {
    ...emptyContract(),
    propsById: {
      title: { id: 'title', name: 'Title', typeRef: 'string' },
    },
  };
  return createDocument('card', 'pir-component', {
    componentContract: contract,
    ui: {
      graph: {
        rootId: 'card-root',
        nodesById: {
          'card-root': {
            id: 'card-root',
            kind: 'element',
            type: 'article',
            text: { kind: 'component-prop', memberId: 'title' },
          },
        },
        childIdsById: { 'card-root': [] },
      },
    },
  });
};

const createCollectionPage = (
  products: readonly {
    id: string;
    name: string;
    tags: readonly string[];
  }[]
): WorkspaceDocument => {
  const nodes: PIRNode[] = [
    {
      id: 'products',
      kind: 'collection',
      source: { kind: 'literal', value: products },
      key: {
        kind: 'binding',
        value: { kind: 'collection-symbol', symbolId: 'product', path: 'id' },
      },
      symbols: {
        itemId: 'product',
        itemName: 'product',
        indexId: 'product-index',
        indexName: 'productIndex',
        errorId: 'products-error',
      },
    },
    {
      id: 'product-card',
      kind: 'component-instance',
      componentDocumentId: 'card',
      bindings: {
        props: {
          title: {
            kind: 'collection-symbol',
            symbolId: 'product',
            path: 'name',
          },
        },
        events: {},
        variants: {},
      },
    },
    {
      id: 'tags',
      kind: 'collection',
      source: {
        kind: 'binding',
        value: {
          kind: 'collection-symbol',
          symbolId: 'product',
          path: 'tags',
        },
      },
      key: { kind: 'index' },
      symbols: {
        itemId: 'tag',
        itemName: 'tag',
        indexId: 'tag-index',
        indexName: 'tagIndex',
      },
    },
    {
      id: 'tag-label',
      kind: 'element',
      type: 'span',
      text: { kind: 'collection-symbol', symbolId: 'tag' },
      props: {
        'data-code': {
          kind: 'code',
          reference: {
            artifactId: 'tag-code',
            sourceSpan: {
              artifactId: 'tag-code',
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 4,
            },
          },
        },
      },
    },
    {
      id: 'empty-products',
      kind: 'element',
      type: 'p',
      text: { kind: 'literal', value: 'No products' },
    },
    {
      id: 'loading-products',
      kind: 'element',
      type: 'p',
      text: { kind: 'literal', value: 'Loading products' },
    },
    {
      id: 'products-error-label',
      kind: 'element',
      type: 'p',
      text: {
        kind: 'collection-symbol',
        symbolId: 'products-error',
        path: 'message',
      },
    },
  ];
  return createDocument('page', 'pir-page', {
    ui: {
      graph: {
        rootId: 'products',
        nodesById: Object.fromEntries(nodes.map((node) => [node.id, node])),
        childIdsById: Object.fromEntries(nodes.map((node) => [node.id, []])),
        regionsById: {
          products: {
            item: ['product-card', 'tags'],
            empty: ['empty-products'],
            loading: ['loading-products'],
            error: ['products-error-label'],
          },
          tags: { item: ['tag-label'] },
        },
      },
    },
  });
};

const createDataBoundCollectionPage = (): WorkspaceDocument => {
  const base = createCollectionPage([]);
  const content = base.content as PIRDocument;
  const collection = content.ui.graph.nodesById.products as Extract<
    PIRNode,
    { kind: 'collection' }
  >;
  return {
    ...base,
    content: {
      ...content,
      logic: {
        dataById: {
          products: {
            operation: {
              documentId: 'catalog-data',
              operationId: 'list-products',
            },
          },
        },
      },
      ui: {
        ...content.ui,
        graph: {
          ...content.ui.graph,
          nodesById: {
            ...content.ui.graph.nodesById,
            products: {
              ...collection,
              source: {
                kind: 'binding',
                value: { kind: 'data', dataId: 'products' },
              },
              lifecycle: {
                kind: 'data-operation',
                dataId: 'products',
                idle: 'loading',
              },
            },
          },
        },
      },
    },
  };
};

const createCollectionSlotDefinition = (): WorkspaceDocument => {
  const contract: PIRComponentContract = {
    ...emptyContract(),
    slotsById: {
      content: { id: 'content', name: 'Content', propsById: {} },
    },
  };
  const collection: PIRNode = {
    id: 'definition-collection',
    kind: 'collection',
    source: { kind: 'literal', value: [{ id: 'definition/:item' }] },
    key: {
      kind: 'binding',
      value: {
        kind: 'collection-symbol',
        symbolId: 'definition-item',
        path: 'id',
      },
    },
    symbols: {
      itemId: 'definition-item',
      itemName: 'definitionItem',
      indexId: 'definition-index',
      indexName: 'definitionIndex',
    },
  };
  const outlet: PIRNode = {
    id: 'content-outlet',
    kind: 'component-slot-outlet',
    slotMemberId: 'content',
    bindings: { props: {} },
  };
  return createDocument('slot-card', 'pir-component', {
    componentContract: contract,
    ui: {
      graph: {
        rootId: collection.id,
        nodesById: { [collection.id]: collection, [outlet.id]: outlet },
        childIdsById: { [collection.id]: [], [outlet.id]: [] },
        regionsById: { [collection.id]: { item: [outlet.id] } },
      },
    },
  });
};

const createCollectionSlotPage = (): WorkspaceDocument => {
  const instance: PIRNode = {
    id: 'slot-card-instance',
    kind: 'component-instance',
    componentDocumentId: 'slot-card',
    bindings: { props: {}, events: {}, variants: {} },
  };
  const collection: PIRNode = {
    id: 'consumer-collection',
    kind: 'collection',
    source: { kind: 'literal', value: [{ id: 'consumer/:item' }] },
    key: {
      kind: 'binding',
      value: {
        kind: 'collection-symbol',
        symbolId: 'consumer-item',
        path: 'id',
      },
    },
    symbols: {
      itemId: 'consumer-item',
      itemName: 'consumerItem',
      indexId: 'consumer-index',
      indexName: 'consumerIndex',
    },
  };
  const label: PIRNode = {
    id: 'consumer-label',
    kind: 'element',
    type: 'span',
    text: {
      kind: 'collection-symbol',
      symbolId: 'consumer-item',
      path: 'id',
    },
  };
  return createDocument('slot-page', 'pir-page', {
    ui: {
      graph: {
        rootId: instance.id,
        nodesById: {
          [instance.id]: instance,
          [collection.id]: collection,
          [label.id]: label,
        },
        childIdsById: {
          [instance.id]: [],
          [collection.id]: [],
          [label.id]: [],
        },
        regionsById: {
          [instance.id]: { content: [collection.id] },
          [collection.id]: { item: [label.id] },
        },
      },
    },
  });
};

describe('PIR Collection compiler conformance', () => {
  it('fails closed with a stable diagnostic when no Data runtime adapter exists', () => {
    const result = compileWorkspacePirReactModules({
      workspace: createWorkspace([
        createDataBoundCollectionPage(),
        createCardDefinition(),
      ]),
      entryDocumentId: 'page',
      target: reactCompileTarget,
    });

    expect(result.status).toBe('blocked');
    expect(result.modules).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'PIR_EXPORT_DATA_OPERATION_UNRESOLVED',
        severity: 'error',
        path: '/docsById/page/content/logic/dataById/products',
      })
    );
  });

  it('compiles nested Collection scopes, Component items and state regions', async () => {
    const result = compileWorkspacePirReactModules({
      workspace: createWorkspace([
        createCollectionPage([
          { id: 'first', name: 'First', tags: ['new', 'sale'] },
          { id: 'second', name: 'Second', tags: [] },
        ]),
        createCardDefinition(),
      ]),
      entryDocumentId: 'page',
      target: reactCompileTarget,
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.dependencyFirstDocumentIds).toEqual(['card', 'page']);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'PIR_COLLECTION_INDEX_KEY_UNSTABLE',
        severity: 'warning',
      })
    );
    const pageModule = result.modules.at(-1)!;
    expect(
      pageModule.sourceTrace.map(
        ({ sourceRef }) => `${sourceRef.id}:${sourceRef.path}`
      )
    ).toEqual(
      expect.arrayContaining([
        'page:/ui/graph/nodesById/products',
        'page:/ui/graph/nodesById/products/symbols/itemId',
        'page:/ui/graph/nodesById/products/symbols/indexId',
        'page:/ui/graph/nodesById/products/symbols/errorId',
        'page:/ui/graph/regionsById/products/item',
        'page:/ui/graph/regionsById/products/empty',
        'page:/ui/graph/regionsById/products/loading',
        'page:/ui/graph/regionsById/products/error',
        'page:/ui/graph/nodesById/tags',
        'page:/ui/graph/regionsById/tags/item',
      ])
    );
    await Promise.all(
      result.modules.map((module) =>
        transformWithEsbuild(module.body, `${module.suggestedName}.tsx`, {
          loader: 'tsx',
          target: 'es2022',
          jsx: 'automatic',
        })
      )
    );
    expect(result.modules.flatMap(typecheckGeneratedModule)).toEqual([]);
  }, 15_000);

  it('fails closed without partial modules for statically duplicated keys', () => {
    const result = compileWorkspacePirReactModules({
      workspace: createWorkspace([
        createCollectionPage([
          { id: 'duplicate', name: 'First', tags: [] },
          { id: 'duplicate', name: 'Second', tags: [] },
        ]),
        createCardDefinition(),
      ]),
      entryDocumentId: 'page',
      target: reactCompileTarget,
    });

    expect(result.status).toBe('blocked');
    expect(result.modules).toEqual([]);
    expect(result.contribution.modules).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'PIR_COLLECTION_KEY_DUPLICATE',
        severity: 'error',
      })
    );
  });

  it('keeps the Definition Collection item path when projecting consumer slot content', async () => {
    const result = compileWorkspacePirReactModules({
      workspace: createWorkspace([
        createCollectionSlotPage(),
        createCollectionSlotDefinition(),
      ]),
      entryDocumentId: 'slot-page',
      target: reactCompileTarget,
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;

    const evaluated = await evaluateGeneratedModules(result.modules);
    const entryModuleId = result.contribution.entryModuleId!;
    const Entry = evaluated.get(entryModuleId)!;
    const locations: Readonly<{
      documentId: string;
      nodeId: string;
      instancePath: string;
    }>[] = [];
    renderToStaticMarkup(
      createElement(Entry, {
        __pdxRuntime: {
          dispatchTrigger: () => undefined,
          resolveCodeValue: () => undefined,
          resolveCollectionPreviewState: (
            location: (typeof locations)[number]
          ) => {
            locations.push(location);
            return { state: 'auto' as const };
          },
        },
      })
    );

    const rootPath = createPirProjectionRootPath('slot-page');
    const definitionPath = appendPirProjectionComponentPath(
      rootPath,
      'slot-page',
      'slot-card-instance',
      'slot-card'
    );
    const definitionItemPath = appendPirProjectionCollectionItemPath(
      definitionPath,
      'slot-card',
      'definition-collection',
      createPirCollectionKeyIdentity('definition/:item')
    );
    const slotPath = appendPirProjectionSlotPath(
      definitionItemPath,
      'slot-page',
      'slot-card-instance',
      'content'
    );
    expect(locations).toContainEqual({
      documentId: 'slot-page',
      nodeId: 'consumer-collection',
      instancePath: slotPath,
    });
  });
});
