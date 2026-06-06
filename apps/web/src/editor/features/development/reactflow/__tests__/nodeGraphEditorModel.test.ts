import type { Edge, Node } from '@xyflow/react';
import type { GraphNodeData } from '@/editor/features/development/reactflow/GraphNode';
import {
  applyNodeGraphEditorStateToGraphs,
  buildNodeGraphEditorState,
  ensureProjectGraphSnapshot,
  normalizeGraphDocuments,
  serializeGraphsForPirLogic,
  type ProjectGraphSnapshot,
} from '@/editor/features/development/reactflow/nodeGraphEditorModel';

const createProcessNode = (
  id: string,
  x: number,
  y: number,
  collapsed = false
): Node<GraphNodeData> => ({
  id,
  type: 'graphNode',
  position: { x, y },
  data: {
    label: `Node ${id}`,
    kind: 'process',
    collapsed,
  },
});

describe('nodeGraphEditorModel', () => {
  it('stores runtime graph in logic and keeps editor state in x-nodeGraphEditor', () => {
    const snapshot: ProjectGraphSnapshot = {
      version: 2,
      activeGraphId: 'graph-main',
      graphs: [
        {
          id: 'graph-main',
          name: 'Main',
          nodes: [
            createProcessNode('node-a', 120, 80, true),
            createProcessNode('node-b', 420, 180),
          ],
          edges: [
            {
              id: 'edge-a-b',
              source: 'node-a',
              target: 'node-b',
              sourceHandle: 'out.control.next',
              targetHandle: 'in.control.prev',
            } as Edge,
          ],
        },
      ],
    };

    const logicGraphs = serializeGraphsForPirLogic(snapshot.graphs);
    expect((logicGraphs[0].nodes[0] as Record<string, unknown>).position).toBe(
      undefined
    );
    expect(
      (logicGraphs[0].nodes[0].data as Record<string, unknown>).collapsed
    ).toBe(undefined);

    const editorState = buildNodeGraphEditorState(snapshot);
    const hydratedGraphs = applyNodeGraphEditorStateToGraphs(
      normalizeGraphDocuments(logicGraphs),
      editorState
    );

    expect(hydratedGraphs[0].nodes[0].position).toEqual({ x: 120, y: 80 });
    expect(hydratedGraphs[0].nodes[0].data.collapsed).toBe(true);
    expect(hydratedGraphs[0].nodes[1].position).toEqual({ x: 420, y: 180 });
  });

  it('assigns fallback node position when logic graph has no editor layout', () => {
    const logicGraphs = [
      {
        id: 'graph-main',
        name: 'Main',
        nodes: [
          {
            id: 'node-a',
            type: 'graphNode',
            data: {
              label: 'Node A',
              kind: 'process',
            },
          },
        ],
        edges: [],
      },
    ];

    const snapshot = ensureProjectGraphSnapshot({
      activeGraphId: 'graph-main',
      graphs: normalizeGraphDocuments(logicGraphs),
    });

    expect(snapshot.graphs[0].nodes[0].position).toEqual({ x: 0, y: 0 });
  });
});
