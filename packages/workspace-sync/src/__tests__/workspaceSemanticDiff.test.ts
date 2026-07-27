import { describe, expect, it } from 'vitest';
import { diffWorkspaceSnapshots } from '..';
import {
  cloneWorkspace,
  createNodeGraphContent,
  createWorkspace,
} from './testWorkspace';

const createNodeGraphWorkspace = () =>
  createWorkspace(createNodeGraphContent(), 'pir-graph');

const content = (workspace: ReturnType<typeof createWorkspace>) =>
  workspace.docsById['document-1']!.content as ReturnType<
    typeof createNodeGraphContent
  >;

describe('workspace semantic diff', () => {
  it('reports a stable node array reorder on the collection without per-entity noise', () => {
    const base = createNodeGraphWorkspace();
    const reordered = cloneWorkspace(base);
    content(reordered).nodes.reverse();

    const result = diffWorkspaceSnapshots(base, reordered);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.changes).toEqual([
      expect.objectContaining({
        kind: 'modify',
        target: expect.objectContaining({
          documentId: 'document-1',
          path: '/nodesById',
        }),
        base: { present: true, value: ['node-a', 'node-b'] },
        next: { present: true, value: ['node-b', 'node-a'] },
      }),
    ]);
  });

  it('addresses standalone changes by document-owned node and edge ids', () => {
    const base = createNodeGraphWorkspace();
    const next = cloneWorkspace(base);
    content(next).nodes[0]!.data.label = 'Local A';
    content(next).edges[0]!.sourceHandle = 'changed';

    const result = diffWorkspaceSnapshots(base, next);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: expect.objectContaining({
            documentId: 'document-1',
            path: '/nodesById/node-a/data/label',
          }),
          semantic: {
            kind: 'graph-node',
            graphKind: 'nodegraph',
            nodeId: 'node-a',
            fieldPath: '/data/label',
          },
        }),
        expect.objectContaining({
          target: expect.objectContaining({
            documentId: 'document-1',
            path: '/edgesById/edge-a-b/sourceHandle',
          }),
          semantic: {
            kind: 'graph-edge',
            graphKind: 'nodegraph',
            edgeId: 'edge-a-b',
            fieldPath: '/sourceHandle',
          },
        }),
      ])
    );
    expect(JSON.stringify(result.changeSet)).not.toContain('graphId');
  });
});
