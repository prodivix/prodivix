import type {
  NodeGraphDebugCommand,
  NodeGraphDebugSnapshot,
  NodeGraphProgramValue,
} from '@prodivix/nodegraph';
import type {
  ExecutionSessionSnapshot,
  ExecutionSourceTrace,
} from '@prodivix/runtime-core';

export type NodeGraphRuntimeInspectorTraceRow = Readonly<{
  id: string;
  sequence: number;
  label: string;
  phase?: string;
  nodeId?: string;
  sourcePath?: string;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type NodeGraphRuntimeInspectorVariable = Readonly<{
  nodeId: string;
  value: NodeGraphProgramValue;
  text: string;
  redacted: boolean;
}>;

export type NodeGraphRuntimeInspectorModel = Readonly<{
  status: string;
  currentNodeId?: string;
  callStack: NodeGraphDebugSnapshot['callStack'];
  variables: readonly NodeGraphRuntimeInspectorVariable[];
  trace: readonly NodeGraphRuntimeInspectorTraceRow[];
  issue?: Readonly<{ code: string; safeMessage: string }>;
  droppedEventCount: number;
  canPause: boolean;
  canContinue: boolean;
  canStep: boolean;
  canCancel: boolean;
  canFreshReplay: boolean;
}>;

const boundedText = (value: NodeGraphProgramValue): string => {
  const text = JSON.stringify(value);
  return text.length > 2_000 ? `${text.slice(0, 2_000)}…` : text;
};

const isRedacted = (value: NodeGraphProgramValue): boolean =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'redacted' in value &&
    value.redacted === true
  );

/** Projects domain execution protocols only; it never reads React Flow state. */
export const createNodeGraphRuntimeInspectorModel = (
  input: Readonly<{
    session?: ExecutionSessionSnapshot;
    debug?: NodeGraphDebugSnapshot;
  }>
): NodeGraphRuntimeInspectorModel => {
  const debugTrace: NodeGraphRuntimeInspectorTraceRow[] = (
    input.debug?.events ?? []
  ).map((event) =>
    Object.freeze({
      id: `debug:${event.sequence}`,
      sequence: event.sequence,
      label: event.kind,
      ...(event.nodeId ? { nodeId: event.nodeId } : {}),
      ...(event.sourcePath ? { sourcePath: event.sourcePath } : {}),
    })
  );
  const sessionTrace: NodeGraphRuntimeInspectorTraceRow[] = (
    input.session?.observations ?? []
  ).map((observation) =>
    Object.freeze({
      id: `session:${observation.sequence}`,
      sequence: observation.sequence,
      label: observation.trace.name,
      phase: observation.trace.phase,
      ...(observation.trace.sourceTrace
        ? { sourceTrace: observation.trace.sourceTrace }
        : {}),
    })
  );
  const variables = Object.entries(input.debug?.outputsByNodeId ?? {}).map(
    ([nodeId, value]) =>
      Object.freeze({
        nodeId,
        value,
        text: boundedText(value),
        redacted: isRedacted(value),
      })
  );
  const debugStatus = input.debug?.status;
  const sessionStatus = input.session?.status ?? 'idle';
  const active =
    debugStatus === 'paused' ||
    debugStatus === 'running' ||
    sessionStatus === 'queued' ||
    sessionStatus === 'starting' ||
    sessionStatus === 'running' ||
    sessionStatus === 'cancelling';
  const terminalFailure = input.session?.terminal?.failure;
  return Object.freeze({
    status: debugStatus ?? sessionStatus,
    ...(input.debug?.current?.nodeId
      ? { currentNodeId: input.debug.current.nodeId }
      : {}),
    callStack: input.debug?.callStack ?? Object.freeze([]),
    variables: Object.freeze(variables),
    trace: Object.freeze([...sessionTrace, ...debugTrace]),
    ...(input.debug?.issue
      ? {
          issue: Object.freeze({
            code: input.debug.issue.code,
            safeMessage: input.debug.issue.safeMessage,
          }),
        }
      : terminalFailure
        ? {
            issue: Object.freeze({
              code: terminalFailure.code,
              safeMessage: terminalFailure.message,
            }),
          }
        : {}),
    droppedEventCount: input.debug?.droppedEventCount ?? 0,
    canPause: debugStatus === 'running',
    canContinue: debugStatus === 'paused',
    canStep: debugStatus === 'paused',
    canCancel: active,
    canFreshReplay:
      debugStatus === 'paused' ||
      debugStatus === 'completed' ||
      debugStatus === 'cancelled' ||
      debugStatus === 'failed',
  });
};

export const createNodeGraphRuntimeInspectorCommand = (
  snapshot: NodeGraphDebugSnapshot,
  kind: Extract<
    NodeGraphDebugCommand['kind'],
    | 'pause'
    | 'step-into'
    | 'step-over'
    | 'step-out'
    | 'continue'
    | 'cancel'
    | 'detach'
  >
): NodeGraphDebugCommand =>
  Object.freeze({
    ...snapshot.identity,
    expectedCommandSequence: snapshot.commandSequence + 1,
    kind,
  });
