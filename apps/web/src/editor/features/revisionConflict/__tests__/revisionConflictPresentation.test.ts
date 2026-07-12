import { describe, expect, it } from 'vitest';
import {
  NODE_GRAPH_DIFF_SEMANTICS,
  summarizeCodeDocumentDiff,
  summarizeNodeGraphDiff,
  validateNodeGraphDiffPresentation,
  type NodeGraphDiffNodePresentation,
} from '@/editor/features/revisionConflict';

const createNode = (
  visualId: string,
  entityId: string,
  status: NodeGraphDiffNodePresentation['status']
): NodeGraphDiffNodePresentation => ({
  entityId,
  label: entityId,
  position: { x: 0, y: 0 },
  status,
  visualId,
});

describe('revision conflict presentation', () => {
  it('keeps the fixed node graph color and non-color semantics', () => {
    expect(NODE_GRAPH_DIFF_SEMANTICS.added).toMatchObject({
      borderStyle: 'solid',
      label: 'ADD',
      symbol: '+',
      tone: 'green',
    });
    expect(NODE_GRAPH_DIFF_SEMANTICS.deleted).toMatchObject({
      borderStyle: 'dashed',
      label: 'DELETE',
      symbol: '−',
      tone: 'red',
    });
    expect(NODE_GRAPH_DIFF_SEMANTICS['conflict-local']).toMatchObject({
      borderStyle: 'solid',
      label: 'LOCAL',
      symbol: 'L',
      tone: 'yellow',
    });
    expect(NODE_GRAPH_DIFF_SEMANTICS['conflict-remote']).toMatchObject({
      borderStyle: 'double',
      label: 'REMOTE',
      symbol: 'R',
      tone: 'purple',
    });
    expect(NODE_GRAPH_DIFF_SEMANTICS.modified.tone).toBe('neutral');
  });

  it('rejects a conflict that would hide either local or remote', () => {
    const localOnly = [createNode('node-a::local', 'node-a', 'conflict-local')];
    expect(validateNodeGraphDiffPresentation(localOnly, [])).toEqual([
      expect.objectContaining({
        code: 'missing-conflict-counterpart',
        entityId: 'node-a',
      }),
    ]);

    const paired = [
      {
        ...localOnly[0],
        ports: [
          {
            entityId: 'port-a',
            label: 'value',
            role: 'output' as const,
            status: 'conflict-local' as const,
            visualId: 'port-a::local',
          },
        ],
      },
      {
        ...createNode('node-a::remote', 'node-a', 'conflict-remote'),
        ports: [
          {
            entityId: 'port-a',
            label: 'value',
            role: 'output' as const,
            status: 'conflict-remote' as const,
            visualId: 'port-a::remote',
          },
        ],
      },
    ];
    expect(
      validateNodeGraphDiffPresentation(paired, [
        {
          entityId: 'edge-a',
          sourceVisualId: 'node-a::local',
          status: 'conflict-local',
          targetVisualId: 'node-a::local',
          visualId: 'edge-a::local',
        },
        {
          entityId: 'edge-a',
          sourceVisualId: 'node-a::remote',
          status: 'conflict-remote',
          targetVisualId: 'node-a::remote',
          visualId: 'edge-a::remote',
        },
      ])
    ).toEqual([]);
  });

  it('reports ambiguous visual IDs and dangling edges', () => {
    const nodes = [
      createNode('node-a', 'node-a', 'added'),
      createNode('node-a', 'node-b', 'deleted'),
    ];
    const issues = validateNodeGraphDiffPresentation(nodes, [
      {
        entityId: 'edge-a-b',
        sourceVisualId: 'node-a',
        status: 'added',
        targetVisualId: 'missing-node',
        visualId: 'node-a',
      },
    ]);

    expect(issues.map((issue) => issue.code)).toEqual([
      'duplicate-visual-id',
      'duplicate-visual-id',
      'dangling-edge-target',
    ]);
  });

  it('counts each paired graph conflict once', () => {
    const nodes = [
      createNode('added', 'added', 'added'),
      createNode('deleted', 'deleted', 'deleted'),
      createNode('modified', 'modified', 'modified'),
      createNode('node-a::local', 'node-a', 'conflict-local'),
      {
        ...createNode('node-a::remote', 'node-a', 'conflict-remote'),
        resolution: 'local' as const,
      },
      createNode('node-b::local', 'node-b', 'conflict-local'),
      createNode('node-b::remote', 'node-b', 'conflict-remote'),
    ];

    expect(summarizeNodeGraphDiff(nodes)).toEqual({
      addedCount: 1,
      conflictCount: 2,
      deletedCount: 1,
      modifiedCount: 1,
      unresolvedConflictCount: 1,
    });
  });

  it('summarizes resolved and unresolved code hunks', () => {
    const emptySide = { lines: [] };
    expect(
      summarizeCodeDocumentDiff([
        {
          id: 'clean',
          isConflict: false,
          local: emptySide,
          remote: emptySide,
        },
        {
          id: 'resolved',
          isConflict: true,
          local: emptySide,
          remote: emptySide,
          resolution: 'remote',
        },
        {
          id: 'pending',
          isConflict: true,
          local: emptySide,
          remote: emptySide,
        },
      ])
    ).toEqual({
      conflictCount: 2,
      hunkCount: 3,
      resolvedConflictCount: 1,
      unresolvedConflictCount: 1,
    });
  });
});
