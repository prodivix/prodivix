import type { Edge } from '@xyflow/react';
import type { PIRDocument } from '@prodivix/shared/types/pir';
import type {
  GraphExecutionRequest,
  GraphExecutionResult,
} from '@/core/executor/executor';

type UnsafeRecord = Record<string, unknown>;

type PirGraphNodeData = {
  kind?: string;
  value?: string;
  label?: string;
  description?: string;
};

type PirGraphNode = {
  id: string;
  type?: string;
  data?: PirGraphNodeData;
};

type PirGraphDocument = {
  id: string;
  name?: string;
  nodes?: PirGraphNode[];
  edges?: Edge[];
};

type NodeGraphExecutionParams = {
  graphId?: string;
  graphName?: string;
};

type NodeExecutionOutcome = {
  nextInput: unknown;
  stop?: boolean;
};

const MAX_GRAPH_STEPS = 200;

const isPlainObject = (value: unknown): value is UnsafeRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeGraphKey = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const debugNodeGraph = (label: string, detail: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;
  console.debug(`[node-graph-executor] ${label}`, detail);
};

const getPirGraphs = (
  pirDoc: PIRDocument | null | undefined
): PirGraphDocument[] => {
  const graphs = pirDoc?.logic?.graphs;
  return Array.isArray(graphs) ? (graphs as PirGraphDocument[]) : [];
};

const pickGraph = (
  graphs: PirGraphDocument[],
  params?: NodeGraphExecutionParams
): PirGraphDocument | null => {
  const graphId = normalizeGraphKey(params?.graphId);
  if (graphId) {
    const byId = graphs.find(
      (graph) => normalizeGraphKey(graph.id) === graphId
    );
    if (byId) return byId;
  }
  const graphName = normalizeGraphKey(params?.graphName);
  if (graphName) {
    const byName = graphs.find(
      (graph) => normalizeGraphKey(graph.name) === graphName
    );
    if (byName) return byName;
  }
  return graphs[0] ?? null;
};

const buildControlAdjacency = (edges: Edge[]) => {
  const outgoing = new Map<string, Edge[]>();
  const incomingCount = new Map<string, number>();
  edges.forEach((edge) => {
    const sourceHandle = normalizeGraphKey(edge.sourceHandle);
    const targetHandle = normalizeGraphKey(edge.targetHandle);
    if (
      !sourceHandle.startsWith('out.control') ||
      !targetHandle.startsWith('in.control')
    ) {
      return;
    }
    const current = outgoing.get(edge.source) ?? [];
    current.push(edge);
    outgoing.set(edge.source, current);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  });
  return { outgoing, incomingCount };
};

const resolveEntryNode = (
  graph: PirGraphDocument,
  incomingCount: Map<string, number>
) => {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const startNode = nodes.find((node) => node.data?.kind === 'start');
  if (startNode) return startNode;
  return (
    nodes.find((node) => (incomingCount.get(node.id) ?? 0) === 0) ??
    nodes[0] ??
    null
  );
};

const executeNode = (
  node: PirGraphNode,
  input: unknown
): NodeExecutionOutcome => {
  const kind = normalizeGraphKey(node.data?.kind);
  switch (kind) {
    case 'start':
      return {
        nextInput: node.data?.value ?? input,
      };
    case 'log':
      if (typeof window !== 'undefined') {
        console.log(node.data?.description ?? node.data?.value ?? input);
      }
      return {
        nextInput: node.data?.description ?? node.data?.value ?? input,
      };
    case 'end':
      return {
        nextInput: input,
        stop: true,
      };
    default:
      return { nextInput: input };
  }
};

export const executePirNodeGraph = async (
  pirDoc: PIRDocument | null | undefined,
  request: GraphExecutionRequest
): Promise<GraphExecutionResult> => {
  const params = isPlainObject(request.params)
    ? (request.params as NodeGraphExecutionParams)
    : undefined;
  const graphs = getPirGraphs(pirDoc);
  const graph = pickGraph(graphs, params);
  debugNodeGraph('select-graph', {
    requestId: request.requestId,
    requestedGraphId: params?.graphId ?? null,
    requestedGraphName: params?.graphName ?? null,
    graphCount: graphs.length,
    selectedGraphId: graph?.id ?? null,
    selectedGraphName: graph?.name ?? null,
  });
  if (!graph) {
    debugNodeGraph('abort:no-graph', {
      requestId: request.requestId,
    });
    return { statePatch: {} };
  }
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const { outgoing, incomingCount } = buildControlAdjacency(edges);
  const entryNode = resolveEntryNode(graph, incomingCount);
  debugNodeGraph('graph-shape', {
    requestId: request.requestId,
    graphId: graph.id,
    graphName: graph.name ?? null,
    nodeKinds: nodes.map((node) => ({
      id: node.id,
      kind: node.data?.kind ?? null,
      label: node.data?.label ?? null,
    })),
    controlEdgeCount: Array.from(outgoing.values()).reduce(
      (count, group) => count + group.length,
      0
    ),
    entryNodeId: entryNode?.id ?? null,
    entryNodeKind: entryNode?.data?.kind ?? null,
  });
  if (!entryNode) {
    debugNodeGraph('abort:no-entry-node', {
      requestId: request.requestId,
      graphId: graph.id,
    });
    return { statePatch: {} };
  }

  let currentNode: PirGraphNode | null = entryNode;
  let currentInput: unknown = undefined;
  let steps = 0;

  while (currentNode && steps < MAX_GRAPH_STEPS) {
    steps += 1;
    debugNodeGraph('step', {
      requestId: request.requestId,
      step: steps,
      nodeId: currentNode.id,
      kind: currentNode.data?.kind ?? null,
      input: currentInput ?? null,
    });
    const outcome = executeNode(currentNode, currentInput);
    currentInput = outcome.nextInput;
    if (outcome.stop) break;
    const nextEdge = (outgoing.get(currentNode.id) ?? [])[0];
    if (!nextEdge) {
      debugNodeGraph('stop:no-next-edge', {
        requestId: request.requestId,
        step: steps,
        nodeId: currentNode.id,
        kind: currentNode.data?.kind ?? null,
      });
      break;
    }
    currentNode = nodes.find((node) => node.id === nextEdge.target) ?? null;
    if (!currentNode) {
      debugNodeGraph('stop:missing-target-node', {
        requestId: request.requestId,
        step: steps,
        targetNodeId: nextEdge.target,
      });
    }
  }

  if (steps >= MAX_GRAPH_STEPS) {
    debugNodeGraph('stop:max-steps', {
      requestId: request.requestId,
      maxSteps: MAX_GRAPH_STEPS,
    });
  }

  return { statePatch: {} };
};
