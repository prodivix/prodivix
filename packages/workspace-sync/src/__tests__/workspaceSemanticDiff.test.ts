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
    content(next).nodes[0]!.configuration.label = 'Local A';
    content(next).nodes[0]!.ports[1]!.id = 'changed';
    content(next).edges[0]!.source.portId = 'changed';

    const result = diffWorkspaceSnapshots(base, next);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: expect.objectContaining({
            documentId: 'document-1',
            path: '/nodesById/node-a/configuration/label',
          }),
          semantic: {
            kind: 'graph-node',
            graphKind: 'nodegraph',
            nodeId: 'node-a',
            fieldPath: '/configuration/label',
          },
        }),
        expect.objectContaining({
          target: expect.objectContaining({
            documentId: 'document-1',
            path: '/edgesById/edge-a-b/source/portId',
          }),
          semantic: {
            kind: 'graph-edge',
            graphKind: 'nodegraph',
            edgeId: 'edge-a-b',
            fieldPath: '/source/portId',
          },
        }),
      ])
    );
    expect(JSON.stringify(result.changeSet)).not.toContain('graphId');
  });
});
