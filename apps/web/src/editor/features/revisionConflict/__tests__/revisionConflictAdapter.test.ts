import { createDefaultPirDoc } from '@prodivix/pir';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  createWorkspaceConflictSession,
  resolveWorkspaceConflictSessionBatch,
} from '@prodivix/workspace-sync';
import { describe, expect, it } from 'vitest';
import {
  adaptWorkspaceConflictSession,
  adaptWorkspaceThreeWayAnalysis,
  validateNodeGraphDiffPresentation,
} from '@/editor/features/revisionConflict';

type SnapshotOptions = {
  aLabel: string;
  codeSource: string;
  edgeLabel: string;
  includeAddedNode?: boolean;
  includeDeletedNode?: boolean;
  revision: number;
};

const createSnapshot = (options: SnapshotOptions): WorkspaceSnapshot => {
  const graphNodes = [
    {
      id: 'node-a',
      type: 'graphNode',
      data: { kind: 'process', label: options.aLabel },
    },
    {
      id: 'node-b',
      type: 'graphNode',
      data: { kind: 'end', label: 'Node B' },
    },
    ...(options.includeDeletedNode
      ? [
          {
            id: 'node-delete',
            type: 'graphNode',
            data: { kind: 'process', label: 'Delete me' },
          },
        ]
      : []),
    ...(options.includeAddedNode
      ? [
          {
            id: 'node-add',
            type: 'graphNode',
            data: { kind: 'process', label: 'Added locally' },
          },
        ]
      : []),
  ];
  const editorNodes = graphNodes.map((node, index) => ({
    id: node.id,
    x: index * 240,
    y: index * 120,
  }));
  const pir = createDefaultPirDoc();
  return {
    id: 'workspace-review',
    workspaceRev: options.revision,
    routeRev: 1,
    opSeq: options.revision,
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: ['page-node', 'code-node'],
      },
      'page-node': {
        id: 'page-node',
        kind: 'doc',
        name: 'home.pir.json',
        parentId: 'root',
        docId: 'page-home',
      },
      'code-node': {
        id: 'code-node',
        kind: 'doc',
        name: 'logic.ts',
        parentId: 'root',
        docId: 'code-logic',
      },
    },
    docsById: {
      'page-home': {
        id: 'page-home',
        type: 'pir-page',
        path: '/home.pir.json',
        contentRev: options.revision,
        metaRev: 1,
        content: {
          ...pir,
          logic: {
            graphs: [
              {
                id: 'checkout-flow',
                name: 'Checkout flow',
                nodes: graphNodes,
                edges: [
                  {
                    id: 'edge-submit',
                    source: 'node-a',
                    target: 'node-b',
                    label: options.edgeLabel,
                  },
                ],
              },
            ],
            'x-nodeGraphEditor': {
              version: 1,
              activeGraphId: 'checkout-flow',
              graphs: [{ id: 'checkout-flow', nodes: editorNodes }],
            },
          },
        },
      },
      'code-logic': {
        id: 'code-logic',
        type: 'code',
        path: '/logic.ts',
        contentRev: options.revision,
        metaRev: 1,
        content: { language: 'ts', source: options.codeSource },
      },
    },
    routeManifest: {
      version: '1',
      root: {
        id: 'root',
        children: [{ id: 'route-home', index: true, pageDocId: 'page-home' }],
      },
    },
  };
};

const createConflictFixture = () => {
  const base = createSnapshot({
    aLabel: 'Base A',
    codeSource: 'const value = 1;\n',
    edgeLabel: 'base edge',
    includeDeletedNode: true,
    revision: 1,
  });
  const local = createSnapshot({
    aLabel: 'Local A',
    codeSource: 'const value = 2;\n',
    edgeLabel: 'local edge',
    includeAddedNode: true,
    includeDeletedNode: true,
    revision: 1,
  });
  const remote = createSnapshot({
    aLabel: 'Remote A',
    codeSource: 'const value = 3;\n',
    edgeLabel: 'remote edge',
    revision: 2,
  });
  const result = createWorkspaceConflictSession({
    id: 'session-review',
    createdAt: '2026-07-12T00:00:00.000Z',
    baseSnapshot: base,
    localSnapshot: local,
    remoteSnapshot: remote,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected conflict session fixture.');
  return result.session;
};

describe('revision conflict core presentation adapter', () => {
  it('projects core text hunks and stable PIR logic graph identities', () => {
    const session = createConflictFixture();
    const presentation = adaptWorkspaceConflictSession(session);

    expect(presentation.codeDocuments).toHaveLength(1);
    expect(presentation.codeDocuments[0]).toMatchObject({
      documentId: 'code-logic',
      documentPath: '/logic.ts',
      language: 'ts',
    });
    const codeHunk = presentation.codeDocuments[0]?.hunks[0];
    expect(codeHunk).toMatchObject({
      isConflict: true,
      local: { lines: [{ content: 'const value = 2;', kind: 'added' }] },
      remote: { lines: [{ content: 'const value = 3;', kind: 'added' }] },
    });
    expect(codeHunk?.resolutionTargetId).toBe(
      presentation.codeDocuments[0]?.conflictIds[0]
    );

    expect(presentation.nodeGraphs).toHaveLength(1);
    const graph = presentation.nodeGraphs[0]!;
    expect(graph).toMatchObject({
      documentId: 'page-home',
      graphId: 'checkout-flow',
      graphLabel: 'Checkout flow',
    });
    expect(
      graph.nodes.find((node) => node.entityId === 'node-add')?.status
    ).toBe('added');
    expect(
      graph.nodes.find((node) => node.entityId === 'node-delete')?.status
    ).toBe('deleted');

    const localNode = graph.nodes.find(
      (node) => node.entityId === 'node-a' && node.status === 'conflict-local'
    );
    const remoteNode = graph.nodes.find(
      (node) => node.entityId === 'node-a' && node.status === 'conflict-remote'
    );
    expect(localNode?.changedFields).toContainEqual({
      base: 'Base A',
      conflictIds: expect.any(Array),
      isConflict: true,
      local: 'Local A',
      path: '/data/label',
      remote: 'Remote A',
    });
    expect(localNode?.position).not.toEqual(remoteNode?.position);
    expect(
      graph.edges.filter((edge) => edge.entityId === 'edge-submit')
    ).toEqual([
      expect.objectContaining({ status: 'conflict-local' }),
      expect.objectContaining({ status: 'conflict-remote' }),
    ]);
    expect(validateNodeGraphDiffPresentation(graph.nodes, graph.edges)).toEqual(
      []
    );
    expect(presentation.unsupportedConflictIds).toEqual([]);
  });

  it('carries session choices to every visual backed by the core conflict', () => {
    const session = createConflictFixture();
    const choices: Record<string, 'local' | 'remote'> = Object.fromEntries(
      session.unresolvedConflictIds.map((conflictId) => [conflictId, 'local'])
    );
    const resolved = resolveWorkspaceConflictSessionBatch(
      session,
      choices,
      '2026-07-12T00:01:00.000Z'
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error('Expected resolved conflict session.');

    const presentation = adaptWorkspaceConflictSession(resolved.session);
    expect(presentation.codeDocuments[0]?.hunks[0]?.resolution).toBe('local');
    const graph = presentation.nodeGraphs[0]!;
    expect(
      graph.nodes
        .filter((node) => node.entityId === 'node-a')
        .map((node) => node.resolution)
    ).toEqual(['local', 'local']);
    expect(
      graph.edges
        .filter((edge) => edge.entityId === 'edge-submit')
        .map((edge) => edge.resolution)
    ).toEqual(['local', 'local']);
  });

  it('can adapt a bare three-way analysis before a session exists', () => {
    const session = createConflictFixture();
    const presentation = adaptWorkspaceThreeWayAnalysis(session.analysis);

    expect(presentation.codeDocuments[0]?.hunks[0]?.isConflict).toBe(true);
    expect(presentation.nodeGraphs[0]).toMatchObject({
      documentId: 'page-home',
      graphId: 'checkout-flow',
    });
    expect(
      presentation.nodeGraphs[0]?.nodes
        .filter((node) => node.entityId === 'node-a')
        .map((node) => [node.status, node.label])
    ).toEqual([
      ['conflict-local', 'Local A'],
      ['conflict-remote', 'Remote A'],
    ]);
  });
});
