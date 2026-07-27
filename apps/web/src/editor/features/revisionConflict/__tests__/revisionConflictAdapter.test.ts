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
  const processNode = (
    id: string,
    label: string,
    outputIds: readonly string[]
  ) => ({
    id,
    descriptorRef: { id: 'core.process', version: '1' },
    ports: [
      {
        id: 'in.control.prev',
        direction: 'input' as const,
        flow: 'control' as const,
        required: false,
        cardinality: 'single' as const,
      },
      ...outputIds.map((outputId) => ({
        id: outputId,
        direction: 'output' as const,
        flow: 'control' as const,
        required: false,
        cardinality: 'single' as const,
      })),
    ],
    configuration: {},
    editor: { label },
  });
  const graphNodes = [
    processNode('node-a', options.aLabel, [
      'base edge',
      'local edge',
      'remote edge',
    ]),
    {
      id: 'node-b',
      descriptorRef: { id: 'core.end', version: '1' },
      ports: [
        {
          id: 'in.control.prev',
          direction: 'input' as const,
          flow: 'control' as const,
          required: true,
          cardinality: 'single' as const,
        },
      ],
      configuration: {},
      editor: { label: 'Node B' },
    },
    ...(options.includeDeletedNode
      ? [processNode('node-delete', 'Delete me', ['out.control.next'])]
      : []),
    ...(options.includeAddedNode
      ? [processNode('node-add', 'Added locally', ['out.control.next'])]
      : []),
  ];
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
        children: ['graph-node', 'code-node'],
      },
      'graph-node': {
        id: 'graph-node',
        kind: 'doc',
        name: 'checkout.pir-graph.json',
        parentId: 'root',
        docId: 'graph-checkout',
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
      'graph-checkout': {
        id: 'graph-checkout',
        type: 'pir-graph',
        name: 'Checkout flow',
        path: '/checkout.pir-graph.json',
        contentRev: options.revision,
        metaRev: 1,
        content: {
          version: 2,
          nodes: graphNodes,
          edges: [
            {
              id: 'edge-submit',
              source: { nodeId: 'node-a', portId: options.edgeLabel },
              target: {
                nodeId: 'node-b',
                portId: 'in.control.prev',
              },
            },
          ],
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
      root: { id: 'root' },
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
  it('projects code hunks and standalone document-owned graph identities', () => {
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
      documentId: 'graph-checkout',
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
      path: '/editor/label',
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
    if (resolved.ok === false) {
      throw new Error(JSON.stringify(resolved.issues));
    }
    expect(resolved.ok).toBe(true);

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
      documentId: 'graph-checkout',
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
