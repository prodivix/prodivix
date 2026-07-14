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
  it('ignores stable node and edge array reorder', () => {
    const base = createNodeGraphWorkspace();
    const reordered = cloneWorkspace(base);
    content(reordered).nodes.reverse();
    content(reordered).edges.reverse();

    const result = diffWorkspaceSnapshots(base, reordered);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.changes).toEqual([]);
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
