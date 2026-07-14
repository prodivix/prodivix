import { describe, expect, it } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type { GraphNodeData } from '../GraphNode';
import {
  cloneNodeGraphDocument,
  toCanonicalNodeGraphDocument,
  toNodeGraphCanvasNodes,
} from '../nodeGraphDocumentProjection';
import {
  createAvailableNodeGraphPath,
  listWorkspaceNodeGraphs,
  selectWorkspaceNodeGraphId,
} from '../nodeGraphWorkspaceDocuments';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-1',
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
      children: ['page-node', 'graph-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'page.json',
      parentId: 'root',
      docId: 'page-1',
    },
    'graph-node': {
      id: 'graph-node',
      kind: 'doc',
      name: 'Checkout.graph.json',
      parentId: 'root',
      docId: 'graph-1',
    },
  },
  docsById: {
    'page-1': {
      id: 'page-1',
      type: 'pir-page',
      path: '/page.json',
      contentRev: 1,
      metaRev: 1,
      content: {},
    },
    'graph-1': {
      id: 'graph-1',
      type: 'pir-graph',
      name: 'Checkout.graph.json',
      path: '/graphs/Checkout.graph.json',
      contentRev: 1,
      metaRev: 1,
      content: { version: 1, nodes: [], edges: [] },
    },
  },
  routeManifest: { version: '1', root: { id: 'root', children: [] } },
  activeDocumentId: 'page-1',
});

describe('standalone NodeGraph Workspace documents', () => {
  it('selects the first standalone graph when the editor entered from a PIR page', () => {
    const workspace = createWorkspace();
    const graphs = listWorkspaceNodeGraphs(workspace);

    expect(graphs.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'graph-1', name: 'Checkout' },
    ]);
    expect(selectWorkspaceNodeGraphId(graphs, workspace.activeDocumentId)).toBe(
      'graph-1'
    );
    expect(
      createAvailableNodeGraphPath({
        workspace,
        name: 'Checkout',
      })
    ).toEqual({ name: 'Checkout 2', path: '/graphs/Checkout 2.graph.json' });
  });

  it('round-trips layout and grouping inside the canonical graph document', () => {
    const nodes: Node<GraphNodeData>[] = [
      {
        id: 'group',
        type: 'graphNode',
        position: { x: 20, y: 30 },
        data: { kind: 'groupBox', label: 'Group', collapsed: true },
      },
      {
        id: 'child',
        type: 'graphNode',
        position: { x: 60, y: 80 },
        parentId: 'group',
        extent: 'parent',
        data: {
          kind: 'process',
          label: 'Child',
          groupBoxId: 'group',
          onChangeValue: () => undefined,
        },
      },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-1',
        source: 'group',
        target: 'child',
        sourceHandle: 'out.control.next',
        targetHandle: 'in.control.prev',
        type: 'smoothstep',
      },
    ];

    const canonical = toCanonicalNodeGraphDocument(nodes, edges);
    const restored = toNodeGraphCanvasNodes(canonical);

    expect(JSON.stringify(canonical)).not.toContain('onChangeValue');
    expect(canonical.nodes[0]!.data).not.toHaveProperty('collapsed');
    expect(restored[0]).toMatchObject({
      position: { x: 20, y: 30 },
      data: { collapsed: true },
    });
    expect(restored[1]).toMatchObject({
      position: { x: 60, y: 80 },
      parentId: 'group',
      extent: 'parent',
    });
  });

  it('duplicates graph-local identities without retaining group or edge aliases', () => {
    const source = toCanonicalNodeGraphDocument(
      [
        {
          id: 'group',
          position: { x: 0, y: 0 },
          data: { kind: 'groupBox', label: 'Group' },
        },
        {
          id: 'child',
          position: { x: 20, y: 30 },
          parentId: 'group',
          extent: 'parent',
          data: {
            kind: 'process',
            label: 'Child',
            groupBoxId: 'group',
          },
        },
      ],
      [{ id: 'edge', source: 'group', target: 'child' }]
    );
    const ids = ['next-group', 'next-child', 'next-edge'];
    const duplicated = cloneNodeGraphDocument(source, () => ids.shift()!);
    const restored = toNodeGraphCanvasNodes(duplicated);

    expect(duplicated.edges[0]).toMatchObject({
      id: 'edge-next-edge',
      source: 'next-group',
      target: 'next-child',
    });
    expect(restored[1]).toMatchObject({
      id: 'next-child',
      parentId: 'next-group',
      data: { groupBoxId: 'next-group' },
    });
  });
});
