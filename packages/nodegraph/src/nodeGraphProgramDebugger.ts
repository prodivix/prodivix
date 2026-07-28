import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type {
  NodeGraphDebugNodeExecutor,
  NodeGraphDebugNodeInvocation,
} from './nodeGraphDebugger.types';
import type {
  NodeGraphProgram,
  NodeGraphProgramValue,
} from './nodeGraphPlanner';
import {
  createFirstPartyNodeGraphProgramExecutorRegistry,
  createNodeGraphTemporaryStateHost,
  type NodeGraphProgramExecutorRegistry,
  type NodeGraphProgramRuntimeGateways,
  type NodeGraphTemporaryStateHost,
} from './nodeGraphProgramRuntime';

export type CreateNodeGraphProgramDebugExecutorInput = Readonly<{
  program: NodeGraphProgram;
  requestInput?: NodeGraphProgramValue;
  grantedCapabilities?: readonly string[];
  gateways?: NodeGraphProgramRuntimeGateways;
  executors?: NodeGraphProgramExecutorRegistry;
  stateHost?: NodeGraphTemporaryStateHost;
}>;

const firstValue = (
  values: Readonly<Record<string, NodeGraphProgramValue>>
): NodeGraphProgramValue | undefined =>
  Object.entries(values).sort(([left], [right]) =>
    compareUnicodeCodePoints(left, right)
  )[0]?.[1];

/**
 * Adapts the first-party Program executor contract to the debugger boundary.
 * It uses Program edges and bounded values only; React Flow state is never read.
 */
export const createNodeGraphProgramDebugExecutor = (
  input: CreateNodeGraphProgramDebugExecutorInput
): NodeGraphDebugNodeExecutor => {
  const executors =
    input.executors ?? createFirstPartyNodeGraphProgramExecutorRegistry();
  const incomingDataEdges = new Map<
    string,
    NodeGraphProgram['edges'][number][]
  >();
  input.program.edges
    .filter(({ flow }) => flow === 'data')
    .forEach((edge) => {
      const current = incomingDataEdges.get(edge.target.nodeId) ?? [];
      current.push(edge);
      current.sort((left, right) =>
        compareUnicodeCodePoints(left.id, right.id)
      );
      incomingDataEdges.set(edge.target.nodeId, current);
    });
  const grantedCapabilities = Object.freeze([
    ...(input.grantedCapabilities ?? input.program.requiredCapabilities),
  ]);
  const stateHost = input.stateHost ?? createNodeGraphTemporaryStateHost();
  const stateTransaction = stateHost.begin(
    `nodegraph-debug:${input.program.programDigest}`
  );
  const terminalNodeId = input.program.executionWaves.at(-1)?.at(-1);
  const gateways: NodeGraphProgramRuntimeGateways = Object.freeze({
    ...input.gateways,
    scheduler:
      input.gateways?.scheduler ??
      Object.freeze({
        wait: () => Promise.resolve(),
      }),
  });

  return async (invocation: NodeGraphDebugNodeInvocation) => {
    const executor = executors.resolve(invocation.node.executorId);
    if (!executor) {
      throw new Error('NodeGraph debug executor is unavailable.');
    }
    const inputs: Record<string, NodeGraphProgramValue> = Object.create(null);
    for (const edge of incomingDataEdges.get(invocation.node.id) ?? []) {
      const value = invocation.inputsByDependencyNodeId[edge.source.nodeId];
      if (value !== undefined) inputs[edge.target.portId] = value;
    }
    const primaryInput =
      firstValue(inputs) ?? firstValue(invocation.inputsByDependencyNodeId);
    const outcome = await executor({
      program: input.program,
      node: invocation.node,
      inputs: Object.freeze(inputs),
      ...(primaryInput === undefined ? {} : { primaryInput }),
      ...(input.requestInput === undefined
        ? {}
        : { requestInput: input.requestInput }),
      attempt: 1,
      signal: Object.freeze({
        get aborted() {
          return invocation.signal.aborted;
        },
        get reasonCode() {
          return invocation.signal.reason;
        },
        subscribe: () => () => undefined,
      }),
      gateways,
      grantedCapabilities,
      readState: (key) => stateTransaction.read(key),
      emitFrame: () => undefined,
    });
    if (outcome.error) {
      throw new Error(outcome.error.safeMessage);
    }
    for (const action of outcome.stateActions ?? []) {
      if (action.kind === 'begin-scope') {
        stateTransaction.beginScope();
      } else if (action.kind === 'commit-scope') {
        if (!stateTransaction.commitScope()) {
          throw new Error(
            'NodeGraph debug state commit has no matching scope.'
          );
        }
      } else if (action.kind === 'rollback-scope') {
        if (!stateTransaction.rollbackScope()) {
          throw new Error(
            'NodeGraph debug state rollback has no matching scope.'
          );
        }
      } else {
        stateTransaction.stage(
          action.key,
          action.value,
          action.expectedVersion
        );
      }
    }
    if (invocation.node.id === terminalNodeId) {
      if (stateTransaction.scopeDepth !== 0) {
        throw new Error(
          'NodeGraph debug execution ended with an open state scope.'
        );
      }
      const committed = stateTransaction.commit();
      if (!committed.ok) {
        throw new Error('NodeGraph debug temporary state commit conflicted.');
      }
    }
    const output =
      outcome.primaryOutput ??
      firstValue(
        Object.freeze({
          ...(outcome.outputs ?? {}),
        }) as Readonly<Record<string, NodeGraphProgramValue>>
      ) ??
      null;
    return Object.freeze({ output });
  };
};
