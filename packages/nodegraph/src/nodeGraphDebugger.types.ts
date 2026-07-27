import type {
  NodeGraphProgram,
  NodeGraphProgramNode,
  NodeGraphProgramValue,
} from './nodeGraphPlanner';

export type NodeGraphDebugStatus =
  'paused' | 'running' | 'completed' | 'cancelled' | 'failed' | 'detached';

export type NodeGraphDebugIdentity = Readonly<{
  jobId: string;
  attemptId: string;
  programDigest: string;
  generation: number;
  leaseId: string;
}>;

export type NodeGraphDebugCommandIdentity = NodeGraphDebugIdentity &
  Readonly<{
    expectedCommandSequence: number;
  }>;

export type NodeGraphDebugCommand =
  | (NodeGraphDebugCommandIdentity &
      Readonly<{
        kind: 'set-breakpoints';
        nodeIds: readonly string[];
      }>)
  | (NodeGraphDebugCommandIdentity &
      Readonly<{
        kind:
          | 'pause'
          | 'step-into'
          | 'step-over'
          | 'step-out'
          | 'continue'
          | 'cancel'
          | 'detach';
      }>);

export type NodeGraphDebugIssue = Readonly<{
  code:
    | 'invalid-program'
    | 'stale-command'
    | 'lease-expired'
    | 'invalid-breakpoint'
    | 'invalid-state'
    | 'executor-failed'
    | 'invalid-output';
  safeMessage: string;
  nodeId?: string;
}>;

export type NodeGraphDebugEvent = Readonly<{
  sequence: number;
  kind:
    | 'attached'
    | 'breakpoints-updated'
    | 'resumed'
    | 'pause-requested'
    | 'breakpoint-hit'
    | 'node-entered'
    | 'node-exited'
    | 'paused'
    | 'completed'
    | 'cancelled'
    | 'detached'
    | 'failed'
    | 'late-completion-discarded';
  commandSequence: number;
  generation: number;
  nodeId?: string;
  sourcePath?: string;
  outputDigest?: string;
  issueCode?: NodeGraphDebugIssue['code'];
}>;

export type NodeGraphDebugSnapshot = Readonly<{
  identity: NodeGraphDebugIdentity;
  status: NodeGraphDebugStatus;
  commandSequence: number;
  eventSequence: number;
  current?: Readonly<{
    nodeId: string;
    waveIndex: number;
    sourcePath: string;
  }>;
  callStack: readonly Readonly<{
    frameId: string;
    documentId: string;
    nodeId: string;
    sourcePath: string;
  }>[];
  breakpoints: readonly string[];
  outputsByNodeId: Readonly<Record<string, NodeGraphProgramValue>>;
  events: readonly NodeGraphDebugEvent[];
  droppedEventCount: number;
  issue?: NodeGraphDebugIssue;
}>;

export type NodeGraphDebugCancellationSignal = Readonly<{
  readonly aborted: boolean;
  readonly reason?: string;
}>;

export type NodeGraphDebugNodeInvocation = Readonly<{
  identity: NodeGraphDebugIdentity;
  node: NodeGraphProgramNode;
  inputsByDependencyNodeId: Readonly<Record<string, NodeGraphProgramValue>>;
  sourcePath: string;
  signal: NodeGraphDebugCancellationSignal;
}>;

export type NodeGraphDebugNodeOutcome = Readonly<{
  output?: unknown;
  sensitiveOutput?: boolean;
}>;

export type NodeGraphDebugNodeExecutor = (
  invocation: NodeGraphDebugNodeInvocation
) => NodeGraphDebugNodeOutcome | Promise<NodeGraphDebugNodeOutcome>;

export type NodeGraphDebugController = Readonly<{
  snapshot(): NodeGraphDebugSnapshot;
  command(command: NodeGraphDebugCommand): Promise<NodeGraphDebugCommandResult>;
}>;

export type NodeGraphDebugCommandResult =
  | Readonly<{
      accepted: true;
      snapshot: NodeGraphDebugSnapshot;
    }>
  | Readonly<{
      accepted: false;
      issue: NodeGraphDebugIssue;
      snapshot: NodeGraphDebugSnapshot;
    }>;

export type CreateNodeGraphDebugControllerInput = Readonly<{
  program: NodeGraphProgram;
  jobId: string;
  attemptId: string;
  leaseId: string;
  executor: NodeGraphDebugNodeExecutor;
  initialGeneration?: number;
  maximumCommands?: number;
  maximumBreakpoints?: number;
  maximumEvents?: number;
  maximumValueDepth?: number;
  maximumValueNodes?: number;
  maximumValueUtf8Bytes?: number;
}>;

export type CreateNodeGraphDebugControllerResult =
  | Readonly<{
      ok: true;
      controller: NodeGraphDebugController;
    }>
  | Readonly<{
      ok: false;
      issue: NodeGraphDebugIssue;
    }>;
