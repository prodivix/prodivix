import type {
  NodeGraphDocument,
  NodeGraphEdge,
  NodeGraphNode,
  NodeGraphPort,
} from '../nodeGraph.types';

export const controlPort = (
  id: string,
  direction: 'input' | 'output',
  required = false,
  cardinality: NodeGraphPort['cardinality'] = 'single'
): NodeGraphPort => ({
  id,
  direction,
  flow: 'control',
  required,
  cardinality,
});

export const dataPort = (
  id: string,
  direction: 'input' | 'output',
  typeRef: string,
  required = false,
  cardinality: NodeGraphPort['cardinality'] = 'single'
): NodeGraphPort => ({
  id,
  direction,
  flow: 'data',
  typeRef,
  required,
  cardinality,
});

export const node = (
  id: string,
  descriptorId: string,
  ports: NodeGraphPort[],
  configuration: Record<string, unknown> = {}
): NodeGraphNode => ({
  id,
  descriptorRef: {
    id: descriptorId.startsWith('core.')
      ? descriptorId
      : `core.${descriptorId}`,
    version: '1',
  },
  ports,
  configuration,
  editor: {},
});

export const edge = (
  id: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string
): NodeGraphEdge => ({
  id,
  source: { nodeId: sourceNodeId, portId: sourcePortId },
  target: { nodeId: targetNodeId, portId: targetPortId },
});

export const linearControlGraph = (
  definitions: readonly Readonly<{
    id: string;
    descriptorId: string;
    configuration?: Record<string, unknown>;
  }>[]
): NodeGraphDocument => ({
  nodes: definitions.map((definition, index) =>
    node(
      definition.id,
      definition.descriptorId,
      [
        ...(index > 0 ? [controlPort('in.control.prev', 'input', true)] : []),
        ...(index < definitions.length - 1
          ? [controlPort('out.control.next', 'output')]
          : []),
      ],
      definition.configuration
    )
  ),
  edges: definitions
    .slice(0, -1)
    .map((definition, index) =>
      edge(
        `edge-${index}`,
        definition.id,
        'out.control.next',
        definitions[index + 1]!.id,
        'in.control.prev'
      )
    ),
});
