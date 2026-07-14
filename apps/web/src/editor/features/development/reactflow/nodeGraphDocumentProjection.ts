import type { NodeGraphDocument, NodeGraphPort } from '@prodivix/nodegraph';
import type { Edge, Node } from '@xyflow/react';
import type { GraphNodeData } from './GraphNode';
import { normalizeCases } from './graphNodeShared';
import { createNode } from './nodeGraphEditorModel';
import { createNodeId } from './nodeGraphEditorUtils';
import { toStableGraphNode } from './nodeGraphStableNode';

const CANVAS_LAYOUT_FIELD = 'x-prodivix-canvas-layout';

const EDITOR_ONLY_NODE_DATA_FIELDS = new Set<keyof GraphNodeData>([
  'collapsed',
  'validationMessage',
  'autoBoxWidth',
  'autoBoxHeight',
  'autoNoteWidth',
  'autoNoteHeight',
  'onPortContextMenu',
  'onAddCase',
  'onRemoveCase',
  'onToggleCollapse',
  'onChangeValue',
  'onChangeExpression',
  'onChangeCode',
  'onChangeCodeLanguage',
  'onChangeCodeSize',
  'onAddStatusCode',
  'onRemoveStatusCode',
  'onChangeStatusCode',
  'onChangeMethod',
  'onAddBranch',
  'onRemoveBranch',
  'onChangeBranchLabel',
  'onAddKeyValueEntry',
  'onRemoveKeyValueEntry',
  'onChangeKeyValueEntry',
  'onAddBindingEntry',
  'onRemoveBindingEntry',
  'onChangeBindingEntry',
  'onChangeField',
  'code',
  'codeLanguage',
  'codeArtifactOptions',
  'onBindCodeArtifact',
  'onOpenCodeSlotDefinition',
  'executor',
  'ports',
]);

type NodeGraphCanvasLayout = Readonly<{
  version: 1;
  x: number;
  y: number;
  parentId?: string;
  extent?: 'parent';
  zIndex?: number;
  collapsed?: boolean;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const readCanvasLayout = (value: unknown): NodeGraphCanvasLayout | null => {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y)
  ) {
    return null;
  }
  return {
    version: 1,
    x: value.x,
    y: value.y,
    ...(typeof value.parentId === 'string' && value.parentId.trim()
      ? { parentId: value.parentId }
      : {}),
    ...(value.extent === 'parent' ? { extent: 'parent' as const } : {}),
    ...(isFiniteNumber(value.zIndex) ? { zIndex: value.zIndex } : {}),
    ...(typeof value.collapsed === 'boolean'
      ? { collapsed: value.collapsed }
      : {}),
  };
};

const createFallbackPosition = (index: number) => ({
  x: (index % 4) * 260,
  y: Math.floor(index / 4) * 150,
});

const toPersistedNodeData = (
  node: Node<GraphNodeData>
): Record<string, unknown> => {
  const persisted: Record<string, unknown> = {};
  Object.entries(node.data).forEach(([field, value]) => {
    if (
      field === CANVAS_LAYOUT_FIELD ||
      EDITOR_ONLY_NODE_DATA_FIELDS.has(field as keyof GraphNodeData) ||
      value === undefined ||
      typeof value === 'function'
    ) {
      return;
    }
    persisted[field] = value;
  });
  persisted[CANVAS_LAYOUT_FIELD] = {
    version: 1,
    x: isFiniteNumber(node.position?.x) ? node.position.x : 0,
    y: isFiniteNumber(node.position?.y) ? node.position.y : 0,
    ...(typeof node.parentId === 'string' && node.parentId.trim()
      ? { parentId: node.parentId }
      : {}),
    ...(node.extent === 'parent' ? { extent: 'parent' as const } : {}),
    ...(isFiniteNumber(node.zIndex) ? { zIndex: node.zIndex } : {}),
    ...(typeof node.data.collapsed === 'boolean'
      ? { collapsed: node.data.collapsed }
      : {}),
  } satisfies NodeGraphCanvasLayout;
  return persisted;
};

const inferConnectedPorts = (
  node: Node<GraphNodeData>,
  edges: readonly Edge[]
): NodeGraphPort[] | undefined => {
  const ports = new Map(
    (node.data.ports ?? []).map((port) => [port.id, port] as const)
  );
  const append = (
    id: string | null | undefined,
    direction: 'input' | 'output'
  ) => {
    if (!id || ports.has(id)) return;
    const semantic = id.includes('.control')
      ? 'control'
      : id.includes('.condition')
        ? 'condition'
        : 'data';
    ports.set(id, {
      id,
      direction,
      kind: semantic === 'control' ? 'control' : 'data',
      ...(semantic === 'condition'
        ? { typeRef: 'boolean' }
        : semantic === 'data'
          ? { typeRef: 'unknown' }
          : {}),
    });
  };
  edges.forEach((edge) => {
    if (edge.source === node.id) append(edge.sourceHandle, 'output');
    if (edge.target === node.id) append(edge.targetHandle, 'input');
  });
  return ports.size
    ? [...ports.values()].sort((left, right) => left.id.localeCompare(right.id))
    : undefined;
};

export const toNodeGraphCanvasNodes = (
  content: NodeGraphDocument,
  current: readonly Node<GraphNodeData>[] = []
): Node<GraphNodeData>[] => {
  const currentPositions = new Map(
    current.map((node) => [node.id, node.position] as const)
  );
  return content.nodes.map((node, index) => {
    const persistedData = { ...node.data };
    const layout = readCanvasLayout(persistedData[CANVAS_LAYOUT_FIELD]);
    delete persistedData[CANVAS_LAYOUT_FIELD];
    const position =
      layout ?? currentPositions.get(node.id) ?? createFallbackPosition(index);
    return toStableGraphNode({
      id: node.id,
      type: node.type,
      position: { x: position.x, y: position.y },
      data: {
        ...(persistedData as GraphNodeData),
        ...(node.executor ? { executor: node.executor } : {}),
        ...(node.ports ? { ports: node.ports } : {}),
        ...(layout?.collapsed !== undefined
          ? { collapsed: layout.collapsed }
          : {}),
      },
      ...(layout?.parentId ? { parentId: layout.parentId } : {}),
      ...(layout?.extent ? { extent: layout.extent } : {}),
      ...(layout?.zIndex !== undefined ? { zIndex: layout.zIndex } : {}),
    });
  });
};

export const toNodeGraphCanvasEdges = (content: NodeGraphDocument): Edge[] =>
  content.edges.map((edge) => ({ ...edge, type: 'smoothstep' }));

export const toCanonicalNodeGraphDocument = (
  nodes: readonly Node<GraphNodeData>[],
  edges: readonly Edge[]
): NodeGraphDocument => ({
  version: 1,
  nodes: nodes.map((node) => {
    const ports = inferConnectedPorts(node, edges);
    return {
      id: node.id,
      ...(typeof node.type === 'string' && node.type.trim()
        ? { type: node.type }
        : {}),
      data: toPersistedNodeData(node),
      ...(ports ? { ports } : {}),
      ...(node.data.executor ? { executor: node.data.executor } : {}),
    };
  }),
  edges: edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle !== undefined
      ? { sourceHandle: edge.sourceHandle }
      : {}),
    ...(edge.targetHandle !== undefined
      ? { targetHandle: edge.targetHandle }
      : {}),
  })),
});

export const createStarterNodeGraphCanvas = (): Readonly<{
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
}> => {
  const nodes = [
    createNode('start', { x: 100, y: 180 }),
    createNode('switch', { x: 380, y: 120 }),
    createNode('process', { x: 720, y: 120 }),
    createNode('end', { x: 980, y: 250 }),
  ];
  const switchCases = normalizeCases(nodes[1]!.data.cases);
  return {
    nodes,
    edges: [
      {
        id: `edge-${createNodeId()}`,
        source: nodes[0]!.id,
        sourceHandle: 'out.control.next',
        target: nodes[1]!.id,
        targetHandle: 'in.control.prev',
        type: 'smoothstep',
      },
      {
        id: `edge-${createNodeId()}`,
        source: nodes[1]!.id,
        sourceHandle: switchCases[0]
          ? `out.control.case-${switchCases[0].id}`
          : 'out.control.default',
        target: nodes[2]!.id,
        targetHandle: 'in.control.prev',
        type: 'smoothstep',
      },
      {
        id: `edge-${createNodeId()}`,
        source: nodes[2]!.id,
        sourceHandle: 'out.control.next',
        target: nodes[3]!.id,
        targetHandle: 'in.control.prev',
        type: 'smoothstep',
      },
    ],
  };
};

export const cloneNodeGraphDocument = (
  source: NodeGraphDocument,
  createId: () => string = createNodeId
): NodeGraphDocument => {
  const nodeIds = new Map(
    source.nodes.map((node) => [node.id, createId()] as const)
  );
  return {
    version: 1,
    nodes: source.nodes.map((node) => {
      const data = { ...node.data };
      const layout = readCanvasLayout(data[CANVAS_LAYOUT_FIELD]);
      if (layout?.parentId) {
        data[CANVAS_LAYOUT_FIELD] = {
          ...layout,
          parentId: nodeIds.get(layout.parentId) ?? layout.parentId,
        };
      }
      if (typeof data.groupBoxId === 'string') {
        data.groupBoxId = nodeIds.get(data.groupBoxId) ?? data.groupBoxId;
      }
      return {
        ...node,
        id: nodeIds.get(node.id)!,
        data,
      };
    }),
    edges: source.edges.map((edge) => ({
      ...edge,
      id: `edge-${createId()}`,
      source: nodeIds.get(edge.source) ?? edge.source,
      target: nodeIds.get(edge.target) ?? edge.target,
    })),
  };
};
