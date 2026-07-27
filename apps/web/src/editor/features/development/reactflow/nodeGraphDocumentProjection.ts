import {
  createNodeGraphExecutorCodeSlotId,
  type NodeGraphDocument,
  type NodeGraphEditorMetadata,
  type NodeGraphPort,
} from '@prodivix/nodegraph';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { Edge, Node } from '@xyflow/react';
import type { GraphNodeData, GraphNodeKind } from './GraphNode';
import { getNodeCatalogItem } from './nodeCatalog';
import { createNode } from './nodeGraphEditorModel';
import { createNodeId } from './nodeGraphEditorUtils';
import { toStableGraphNode } from './nodeGraphStableNode';

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
  'onAddBindingEntry',
  'onRemoveBindingEntry',
  'onChangeField',
  'code',
  'codeLanguage',
  'codeArtifactOptions',
  'onBindCodeArtifact',
  'onOpenCodeSlotDefinition',
  'executor',
  'ports',
  'kind',
  'label',
]);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const createFallbackPosition = (index: number) => ({
  x: (index % 4) * 260,
  y: Math.floor(index / 4) * 150,
});

const toPersistedConfiguration = (
  node: Node<GraphNodeData>
): Record<string, unknown> => {
  const persisted: Record<string, unknown> = {};
  Object.entries(node.data).forEach(([field, value]) => {
    if (
      EDITOR_ONLY_NODE_DATA_FIELDS.has(field as keyof GraphNodeData) ||
      value === undefined ||
      typeof value === 'function'
    ) {
      return;
    }
    persisted[field] = value;
  });
  return persisted;
};

const toEditorMetadata = (
  node: Node<GraphNodeData>
): NodeGraphEditorMetadata => ({
  position: {
    x: isFiniteNumber(node.position?.x) ? node.position.x : 0,
    y: isFiniteNumber(node.position?.y) ? node.position.y : 0,
  },
  ...(typeof node.parentId === 'string' && node.parentId.trim()
    ? { parentId: node.parentId }
    : {}),
  ...(node.extent === 'parent' ? { extent: 'parent' as const } : {}),
  ...(isFiniteNumber(node.zIndex) && Number.isSafeInteger(node.zIndex)
    ? { zIndex: node.zIndex }
    : {}),
  ...(typeof node.data.collapsed === 'boolean'
    ? { collapsed: node.data.collapsed }
    : {}),
  ...(typeof node.data.label === 'string' && node.data.label.trim()
    ? { label: node.data.label.trim() }
    : {}),
});

const semanticPort = (
  id: string,
  direction: 'input' | 'output'
): NodeGraphPort => {
  const semantic = id.includes('.control')
    ? 'control'
    : id.includes('.condition')
      ? 'condition'
      : 'data';
  return {
    id,
    direction,
    flow: semantic === 'control' ? 'control' : 'data',
    ...(semantic === 'condition'
      ? { typeRef: 'boolean' }
      : semantic === 'data'
        ? { typeRef: 'nodegraph:unknown' }
        : {}),
    required: false,
    cardinality: 'single',
  };
};

const inferPorts = (
  node: Node<GraphNodeData>,
  edges: readonly Edge[]
): NodeGraphPort[] => {
  const ports = new Map(
    (node.data.ports ?? []).map((port) => [port.id, port] as const)
  );
  const profile = getNodeCatalogItem(node.data.kind).ports;
  for (const [field, direction] of [
    ['controlIn', 'input'],
    ['dataIn', 'input'],
    ['conditionIn', 'input'],
    ['controlOut', 'output'],
    ['dataOut', 'output'],
    ['conditionOut', 'output'],
  ] as const) {
    const id = profile[field];
    if (id && !ports.has(id)) ports.set(id, semanticPort(id, direction));
  }
  const append = (
    id: string | null | undefined,
    direction: 'input' | 'output'
  ) => {
    if (!id || ports.has(id)) return;
    ports.set(id, semanticPort(id, direction));
  };
  edges.forEach((edge) => {
    if (edge.source === node.id) append(edge.sourceHandle, 'output');
    if (edge.target === node.id) append(edge.targetHandle, 'input');
  });
  return [...ports.values()].sort((left, right) =>
    compareUnicodeCodePoints(left.id, right.id)
  );
};

const descriptorKind = (descriptorId: string): GraphNodeKind => {
  const kind = descriptorId.startsWith('core.')
    ? descriptorId.slice('core.'.length)
    : descriptorId;
  return kind as GraphNodeKind;
};

export const toNodeGraphCanvasNodes = (
  content: NodeGraphDocument,
  current: readonly Node<GraphNodeData>[] = []
): Node<GraphNodeData>[] => {
  const currentPositions = new Map(
    current.map((node) => [node.id, node.position] as const)
  );
  return content.nodes.map((node, index) => {
    const position =
      node.editor.position ??
      currentPositions.get(node.id) ??
      createFallbackPosition(index);
    const kind = descriptorKind(node.descriptorRef.id);
    return toStableGraphNode({
      id: node.id,
      type: 'graphNode',
      position: { x: position.x, y: position.y },
      data: {
        label: node.editor.label ?? kind,
        kind,
        ...(node.configuration as Partial<GraphNodeData>),
        ...(node.codeSlot ? { executor: node.codeSlot } : {}),
        ports: node.ports,
        ...(node.editor.collapsed !== undefined
          ? { collapsed: node.editor.collapsed }
          : {}),
      },
      ...(node.editor.parentId ? { parentId: node.editor.parentId } : {}),
      ...(node.editor.extent ? { extent: node.editor.extent } : {}),
      ...(node.editor.zIndex !== undefined
        ? { zIndex: node.editor.zIndex }
        : {}),
    });
  });
};

export const toNodeGraphCanvasEdges = (content: NodeGraphDocument): Edge[] =>
  content.edges.map((edge) => ({
    id: edge.id,
    source: edge.source.nodeId,
    sourceHandle: edge.source.portId,
    target: edge.target.nodeId,
    targetHandle: edge.target.portId,
    type: 'smoothstep',
  }));

export const toCanonicalNodeGraphDocument = (
  nodes: readonly Node<GraphNodeData>[],
  edges: readonly Edge[]
): NodeGraphDocument => ({
  nodes: nodes.map((node) => ({
    id: node.id,
    descriptorRef: {
      id: `core.${node.data.kind}`,
      version: '1',
    },
    ports: inferPorts(node, edges),
    configuration: toPersistedConfiguration(node),
    editor: toEditorMetadata(node),
    ...(node.data.executor ? { codeSlot: node.data.executor } : {}),
  })),
  edges: edges.flatMap((edge) =>
    edge.sourceHandle && edge.targetHandle
      ? [
          {
            id: edge.id,
            source: {
              nodeId: edge.source,
              portId: edge.sourceHandle,
            },
            target: {
              nodeId: edge.target,
              portId: edge.targetHandle,
            },
          },
        ]
      : []
  ),
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
        sourceHandle: 'out.control.default',
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

const remapClonedNodeConfiguration = (
  configuration: Readonly<Record<string, unknown>>,
  nodeIds: ReadonlyMap<string, string>
): Record<string, unknown> => {
  const { groupBoxId, ...remaining } = configuration;
  return {
    ...remaining,
    ...(typeof groupBoxId === 'string' && nodeIds.has(groupBoxId)
      ? { groupBoxId: nodeIds.get(groupBoxId)! }
      : {}),
  };
};

export const cloneNodeGraphDocument = (
  source: NodeGraphDocument,
  targetDocumentId: string,
  createId: () => string = createNodeId
): NodeGraphDocument => {
  const nodeIds = new Map(
    source.nodes.map((node) => [node.id, createId()] as const)
  );
  return {
    nodes: source.nodes.map((node) => ({
      ...node,
      id: nodeIds.get(node.id)!,
      configuration: remapClonedNodeConfiguration(node.configuration, nodeIds),
      editor: {
        ...node.editor,
        ...(node.editor.parentId
          ? {
              parentId:
                nodeIds.get(node.editor.parentId) ?? node.editor.parentId,
            }
          : {}),
      },
      ...(node.codeSlot
        ? {
            codeSlot: {
              ...node.codeSlot,
              slotId: createNodeGraphExecutorCodeSlotId(
                targetDocumentId,
                nodeIds.get(node.id)!
              ),
            },
          }
        : {}),
    })),
    edges: source.edges.map((edge) => ({
      ...edge,
      id: `edge-${createId()}`,
      source: {
        ...edge.source,
        nodeId: nodeIds.get(edge.source.nodeId) ?? edge.source.nodeId,
      },
      target: {
        ...edge.target,
        nodeId: nodeIds.get(edge.target.nodeId) ?? edge.target.nodeId,
      },
    })),
    ...(source.publicContract
      ? {
          publicContract: {
            ...source.publicContract,
            inputs: source.publicContract.inputs.map((port) => ({
              ...port,
              port: {
                ...port.port,
                nodeId: nodeIds.get(port.port.nodeId) ?? port.port.nodeId,
              },
            })),
            outputs: source.publicContract.outputs.map((port) => ({
              ...port,
              port: {
                ...port.port,
                nodeId: nodeIds.get(port.port.nodeId) ?? port.port.nodeId,
              },
            })),
          },
        }
      : {}),
  };
};
