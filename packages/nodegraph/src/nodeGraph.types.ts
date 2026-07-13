import type {
  RuntimeCancellationSignal,
  RuntimeExecutionRequest,
  RuntimeExecutorRegistry,
  RuntimeStatePatch,
  RuntimeTraceEvent,
} from '@prodivix/runtime-core';

export type NodeGraphNodeData = Record<string, unknown> & {
  kind?: string;
  value?: unknown;
  label?: string;
  description?: string;
};

export type NodeGraphNode = {
  id: string;
  type?: string;
  data: NodeGraphNodeData;
};

export type NodeGraphEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export type NodeGraphDocument = {
  id: string;
  name?: string;
  nodes: NodeGraphNode[];
  edges: NodeGraphEdge[];
};

export type NodeGraphSelection = {
  graphId?: string;
  graphName?: string;
};

export type NodeGraphDecodeIssue = {
  path: string;
  message: string;
};

export type NodeGraphDecodeResult =
  | { ok: true; value: NodeGraphDocument[] }
  | { ok: false; issues: NodeGraphDecodeIssue[] };

export type NodeGraphExecutionParams = NodeGraphSelection &
  Record<string, unknown>;

export type NodeGraphExecutionRequest =
  RuntimeExecutionRequest<NodeGraphExecutionParams> & {
    signal?: RuntimeCancellationSignal;
  };

export type NodeGraphNodeTrace = {
  kind: string;
  detail?: Record<string, unknown>;
};

export type NodeGraphNodeExecutionContext = {
  graph: NodeGraphDocument;
  node: NodeGraphNode;
  input: unknown;
  request: NodeGraphExecutionRequest;
};

export type NodeGraphNodeExecutionOutcome = {
  output?: unknown;
  statePatch?: RuntimeStatePatch;
  nextHandle?: string;
  stop?: boolean;
  trace?: NodeGraphNodeTrace[];
};

export type NodeGraphNodeExecutorRegistry = RuntimeExecutorRegistry<
  NodeGraphNodeExecutionContext,
  NodeGraphNodeExecutionOutcome
>;

export type NodeGraphTraceKind =
  | 'graph-started'
  | 'node-started'
  | 'node-completed'
  | 'log'
  | 'graph-completed'
  | 'graph-stopped';

export type NodeGraphTraceEvent = RuntimeTraceEvent<
  NodeGraphTraceKind,
  Record<string, unknown>
>;

export type NodeGraphExecutionStatus =
  | 'completed'
  | 'no-entry'
  | 'unsupported-node'
  | 'missing-target'
  | 'max-steps'
  | 'cancelled';

export type NodeGraphExecutionResult = {
  status: NodeGraphExecutionStatus;
  statePatch: RuntimeStatePatch;
  output?: unknown;
  steps: number;
  trace: NodeGraphTraceEvent[];
};

export type NodeGraphExecutorOptions = {
  maxSteps?: number;
  registry?: NodeGraphNodeExecutorRegistry;
};

export type NodeGraphExecutor = (
  graph: NodeGraphDocument,
  request: NodeGraphExecutionRequest
) => Promise<NodeGraphExecutionResult>;
