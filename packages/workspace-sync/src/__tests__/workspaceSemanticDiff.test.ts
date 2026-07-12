import { describe, expect, it } from 'vitest';
import { diffWorkspaceSnapshots } from '..';
import {
  cloneWorkspace,
  createPirContent,
  createWorkspace,
} from './testWorkspace';

const pirContent = (workspace: ReturnType<typeof createWorkspace>) =>
  workspace.docsById['document-1']!.content as ReturnType<
    typeof createPirContent
  >;

describe('workspace semantic diff', () => {
  it('uses graph, node, edge, and animation ids and ignores stable-array reorder', () => {
    const base = createWorkspace();
    const reordered = cloneWorkspace(base);
    const content = pirContent(reordered);
    content.logic.graphs.reverse();
    content.logic.graphs[1]!.nodes.reverse();
    content.logic.graphs[1]!.edges.reverse();
    content.animation.timelines.reverse();
    content.animation.timelines[1]!.bindings.reverse();
    content.animation.timelines[1]!.bindings[1]!.tracks.reverse();

    const result = diffWorkspaceSnapshots(base, reordered);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.changes).toEqual([]);
  });

  it('addresses changes through stable semantic ids rather than array indexes', () => {
    const base = createWorkspace();
    const next = cloneWorkspace(base);
    const content = pirContent(next);
    content.logic.graphs[0]!.nodes[0]!.label = 'Local A';
    content.logic.graphs[0]!.edges[0]!.label = 'changed';
    content.animation.timelines[0]!.bindings[0]!.tracks[0]!.property = 'color';

    const result = diffWorkspaceSnapshots(base, next);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changeSet.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: expect.objectContaining({
            path: '/logic/graphsById/graph-main/nodesById/node-a/label',
          }),
          semantic: expect.objectContaining({
            kind: 'graph-node',
            graphId: 'graph-main',
            nodeId: 'node-a',
          }),
        }),
        expect.objectContaining({
          target: expect.objectContaining({
            path: '/logic/graphsById/graph-main/edgesById/edge-a-b/label',
          }),
          semantic: expect.objectContaining({
            kind: 'graph-edge',
            graphId: 'graph-main',
            edgeId: 'edge-a-b',
          }),
        }),
        expect.objectContaining({
          target: expect.objectContaining({
            path: '/animation/timelinesById/timeline-main/bindingsById/binding-a/tracksById/track-opacity/property',
          }),
          semantic: expect.objectContaining({
            kind: 'animation-entity',
            entityKind: 'track',
            entityId: 'track-opacity',
          }),
        }),
      ])
    );
    expect(
      result.changeSet.changes.some((change) =>
        /\/\d+\//.test(change.target.path)
      )
    ).toBe(false);
  });
});
