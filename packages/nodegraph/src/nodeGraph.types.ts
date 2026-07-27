import type { CodeSlotBinding } from '@prodivix/authoring';
import type {
  RuntimeCancellationSignal,
  RuntimeExecutionRequest,
  RuntimeExecutorRegistry,
  RuntimeStatePatch,
  RuntimeTraceEvent,
} from '@prodivix/runtime-core';

export type NodeGraphPortFlow = 'control' | 'data';
export type NodeGraphPortCardinality = 'single' | 'multiple';

export type NodeGraphPort = {
  id: string;
  direction: 'input' | 'output';
  flow: NodeGraphPortFlow;
  typeRef?: string;
  required: boolean;
  cardinality: NodeGraphPortCardinality;
};

export type NodeGraphPortReference = {
  nodeId: string;
  portId: string;
};

export type NodeGraphDescriptorReference = {
  id: string;
  version: string;
};

export type NodeGraphConfiguration = Record<string, unknown>;

export type NodeGraphEditorMetadata = {
  position?: Readonly<{ x: number; y: number }>;
  parentId?: string;
  extent?: 'parent';
  zIndex?: number;
  collapsed?: boolean;
  label?: string;
};

export type NodeGraphNode = {
  id: string;
  descriptorRef: NodeGraphDescriptorReference;
  ports: NodeGraphPort[];
  configuration: NodeGraphConfiguration;
  editor: NodeGraphEditorMetadata;
  codeSlot?: CodeSlotBinding;
};

export type NodeGraphEdge = {
  id: string;
  source: NodeGraphPortReference;
  target: NodeGraphPortReference;
};

export type NodeGraphPublicPort = {
  id: string;
  port: NodeGraphPortReference;
  typeRef: string;
  required: boolean;
};

export type NodeGraphPublicContract = {
  inputs: NodeGraphPublicPort[];
  outputs: NodeGraphPublicPort[];
  errors: string[];
  requiredCapabilities: string[];
  maximumSteps: number;
};

/**
 * Version-neutral current NodeGraph domain model. Numeric versions only exist
 * in the wire codec and persistence boundary.
 */
export type NodeGraphDocument = {
  nodes: NodeGraphNode[];
  edges: NodeGraphEdge[];
  publicContract?: NodeGraphPublicContract;
};

export type NodeGraphDecodeIssue = {
  path: string;
  message: string;
};

export type NodeGraphDecodeResult =
  | {
      ok: true;
      value: NodeGraphDocument;
      sourceWireVersion: number;
      appliedMigrations: readonly Readonly<{
        fromVersion: number;
        toVersion: number;
      }>[];
    }
  | { ok: false; issues: NodeGraphDecodeIssue[] };

export type NodeGraphValidationResult =
  | { ok: true; value: NodeGraphDocument }
  | { ok: false; issues: NodeGraphDecodeIssue[] };

export type NodeGraphExecutionParams = Record<string, unknown>;

export type NodeGraphExecutionRequest =
  RuntimeExecutionRequest<NodeGraphExecutionParams> & {
    documentId: string;
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
  nextPortId?: string;
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
  onTrace?: (event: NodeGraphTraceEvent) => void;
};

export type NodeGraphExecutor = (
  graph: NodeGraphDocument,
  request: NodeGraphExecutionRequest
) => Promise<NodeGraphExecutionResult>;
