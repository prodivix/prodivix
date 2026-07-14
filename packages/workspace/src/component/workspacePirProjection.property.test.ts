import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PIRDocument, PIRNode } from '@prodivix/pir';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from '../types';
import { createWorkspacePirProjectionPlan } from './workspacePirProjection';

const propertyParameters = Object.freeze({
  numRuns: 24,
  seed: 0x15_07_2026,
});

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/);

const createDocumentContent = (
  root: PIRNode,
  children: readonly PIRNode[] = [],
  component = false
): PIRDocument => ({
  ...(component
    ? {
        componentContract: {
          propsById: {},
          eventsById: {},
          slotsById: {},
          variantAxesById: {},
        },
      }
    : {}),
  ui: {
    graph: {
      rootId: root.id,
      nodesById: Object.fromEntries(
        [root, ...children].map((node) => [node.id, node])
      ),
      childIdsById: Object.fromEntries(
        [root, ...children].map((node) => [
          node.id,
          node.id === root.id ? children.map((child) => child.id) : [],
        ])
      ),
    },
  },
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
      children: documents.map((document) => `node-${document.id}`),
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
    id: 'workspace-pir-projection',
    workspaceRev: 31,
    routeRev: 2,
    opSeq: 4,
    treeRootId: 'root',
    treeById,
    docsById: Object.fromEntries(
      documents.map((document) => [document.id, document])
    ),
    routeManifest: { version: '1', root: { id: 'route-root' } },
  };
};

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

describe('Workspace canonical PIR projection properties', () => {
  it('creates a deterministic dependency-first projection with one shared Definition', () => {
    fc.assert(
      fc.property(identifier, fc.boolean(), (suffix, reverse) => {
        const componentId = `component-${suffix}`;
        const instance = (id: string): PIRNode => ({
          id,
          kind: 'component-instance',
          componentDocumentId: componentId,
          bindings: { props: {}, events: {}, variants: {} },
        });
        const page = createDocument(
          'page',
          'pir-page',
          createDocumentContent({ id: 'root', kind: 'element', type: 'main' }, [
            instance('first'),
            instance('second'),
          ])
        );
        const component = createDocument(
          componentId,
          'pir-component',
          createDocumentContent(
            { id: 'definition-root', kind: 'element', type: 'section' },
            [],
            true
          )
        );
        const workspace = createWorkspace(
          reverse ? [component, page] : [page, component]
        );
        const result = createWorkspacePirProjectionPlan({
          workspace,
          entryDocumentId: page.id,
        });

        expect(result.status).toBe('ready');
        if (result.status !== 'ready') return;
        expect(result.plan.dependencyFirstDocumentIds).toEqual([
          componentId,
          page.id,
        ]);
        expect(result.plan.componentDocumentIds).toEqual([componentId]);
        expect(Object.keys(result.plan.documentsById)).toHaveLength(2);

        const sourceRoot = (page.content as PIRDocument).ui.graph.nodesById
          .root as { type: string };
        sourceRoot.type = 'aside';
        page.contentRev = 99;
        expect(
          result.plan.entryDocument.content.ui.graph.nodesById.root
        ).toMatchObject({ type: 'main' });
        expect(result.plan.entryDocument.contentRev).toBe(1);
        expect(
          Object.isFrozen(
            result.plan.entryDocument.content.ui.graph.nodesById.root
          )
        ).toBe(true);
        expect(Object.isFrozen(result.plan.graph.edges[0])).toBe(true);
      }),
      propertyParameters
    );
  });

  it('includes structurally valid Collection documents in the S4 projection', () => {
    const collection: PIRNode = {
      id: 'items',
      kind: 'collection',
      source: { kind: 'literal', value: [] },
      key: { kind: 'index' },
      symbols: {
        itemId: 'item-symbol',
        itemName: 'item',
        indexId: 'index-symbol',
        indexName: 'index',
      },
    };
    const collectionContent = createDocumentContent(collection);
    const workspace = createWorkspace([
      createDocument('page', 'pir-page', {
        ...collectionContent,
        ui: {
          graph: {
            ...collectionContent.ui.graph,
            regionsById: { items: { item: [] } },
          },
        },
      }),
    ]);
    const result = createWorkspacePirProjectionPlan({
      workspace,
      entryDocumentId: 'page',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.plan.entryDocument.content.ui.graph.nodesById.items).toEqual(
      collection
    );
  });

  it('does not let an unrelated Component cycle block an entry projection', () => {
    const createCyclicComponent = (
      id: string,
      targetId: string
    ): WorkspaceDocument =>
      createDocument(
        id,
        'pir-component',
        createDocumentContent(
          {
            id: `${id}-instance`,
            kind: 'component-instance',
            componentDocumentId: targetId,
            bindings: { props: {}, events: {}, variants: {} },
          },
          [],
          true
        )
      );
    const page = createDocument(
      'page',
      'pir-page',
      createDocumentContent({ id: 'root', kind: 'element', type: 'main' })
    );
    const workspace = createWorkspace([
      page,
      createCyclicComponent('cycle-a', 'cycle-b'),
      createCyclicComponent('cycle-b', 'cycle-a'),
    ]);

    const result = createWorkspacePirProjectionPlan({
      workspace,
      entryDocumentId: page.id,
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.plan.dependencyFirstDocumentIds).toEqual([page.id]);
    expect(Object.keys(result.plan.documentsById)).toEqual([page.id]);
    expect(result.plan.graph.componentDocumentIds).toEqual([]);
    expect(result.plan.graph.componentTopologicalOrder).toEqual([]);
  });
});
