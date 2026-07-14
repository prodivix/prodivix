import {
  createRuntimeExecutorRegistry,
  mergeRuntimeStatePatch,
} from '@prodivix/runtime-core';
import type {
  NodeGraphDocument,
  NodeGraphEdge,
  NodeGraphExecutionResult,
  NodeGraphExecutor,
  NodeGraphExecutorOptions,
  NodeGraphNode,
  NodeGraphNodeExecutionContext,
  NodeGraphNodeExecutionOutcome,
  NodeGraphNodeExecutorRegistry,
  NodeGraphTraceEvent,
  NodeGraphTraceKind,
} from './nodeGraph.types';

const DEFAULT_MAX_STEPS = 200;

const normalizeNodeKind = (node: NodeGraphNode): string => {
  const executorSlotId = node.executor?.slotId.trim();
  if (executorSlotId) return executorSlotId;
  const kind = typeof node.data.kind === 'string' ? node.data.kind.trim() : '';
  if (kind) return kind;
  return typeof node.type === 'string' ? node.type.trim() : '';
};

const isControlEdge = (edge: NodeGraphEdge): boolean =>
  (edge.sourceHandle ?? '').startsWith('out.control') &&
  (edge.targetHandle ?? '').startsWith('in.control');

const buildControlAdjacency = (graph: NodeGraphDocument) => {
  const outgoing = new Map<string, NodeGraphEdge[]>();
  const incomingCount = new Map<string, number>();
  graph.edges.filter(isControlEdge).forEach((edge) => {
    const current = outgoing.get(edge.source) ?? [];
    current.push(edge);
    outgoing.set(edge.source, current);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  });
  return { outgoing, incomingCount };
};

const resolveEntryNode = (
  graph: NodeGraphDocument,
  incomingCount: Map<string, number>
): NodeGraphNode | null =>
  graph.nodes.find((node) => normalizeNodeKind(node) === 'start') ??
  graph.nodes.find((node) => (incomingCount.get(node.id) ?? 0) === 0) ??
  null;

const resolveNextEdge = (
  outgoing: NodeGraphEdge[],
  nextHandle: string | undefined
): NodeGraphEdge | undefined => {
  if (!nextHandle) return outgoing[0];
  return outgoing.find((edge) => edge.sourceHandle === nextHandle);
};

export const createDefaultNodeGraphNodeExecutorRegistry =
  (): NodeGraphNodeExecutorRegistry => {
    const registry = createRuntimeExecutorRegistry<
      NodeGraphNodeExecutionContext,
      NodeGraphNodeExecutionOutcome
    >();
    registry.register('start', ({ node, input }) => ({
      output: node.data.value ?? input,
    }));
    registry.register('log', ({ node, input }) => {
      const output = node.data.description ?? node.data.value ?? input;
      return {
        output,
        trace: [{ kind: 'log', detail: { value: output } }],
      };
    });
    registry.register('end', ({ input }) => ({ output: input, stop: true }));
    return registry;
  };

/**
 * Creates a deterministic NodeGraph executor. The executor consumes only a
 * validated domain document and reports side effects through result/trace data.
 */
export const createNodeGraphExecutor = (
  options: NodeGraphExecutorOptions = {}
): NodeGraphExecutor => {
  const registry =
    options.registry ?? createDefaultNodeGraphNodeExecutorRegistry();
  const maxSteps = Math.max(
    1,
    Math.trunc(options.maxSteps ?? DEFAULT_MAX_STEPS)
  );

  return async (graph, request) => {
    const trace: NodeGraphTraceEvent[] = [];
    let sequence = 0;
    const appendTrace = (
      kind: NodeGraphTraceKind,
      detail: Record<string, unknown>
    ) => {
      sequence += 1;
      trace.push({ sequence, kind, detail });
    };
    const finish = (
      status: NodeGraphExecutionResult['status'],
      steps: number,
      statePatch: Record<string, unknown>,
      output?: unknown,
      detail: Record<string, unknown> = {}
    ): NodeGraphExecutionResult => {
      appendTrace(
        status === 'completed' ? 'graph-completed' : 'graph-stopped',
        {
          documentId: request.documentId,
          status,
          steps,
          ...detail,
        }
      );
      return {
        status,
        statePatch,
        ...(output !== undefined ? { output } : {}),
        steps,
        trace,
      };
    };

    appendTrace('graph-started', {
      documentId: request.documentId,
      requestId: request.requestId,
      sourceOwnerId: request.source.ownerId,
    });
    const { outgoing, incomingCount } = buildControlAdjacency(graph);
    let currentNode = resolveEntryNode(graph, incomingCount);
    if (!currentNode) {
      return finish('no-entry', 0, {}, undefined, {
        reason: 'Graph has no executable entry node.',
      });
    }

    let steps = 0;
    let input = request.input;
    let statePatch: Record<string, unknown> = {};

    while (currentNode && steps < maxSteps) {
      if (request.signal?.aborted) {
        return finish('cancelled', steps, statePatch, input, {
          nodeId: currentNode.id,
          reason: request.signal.reason,
        });
      }

      steps += 1;
      const nodeKind = normalizeNodeKind(currentNode);
      appendTrace('node-started', {
        documentId: request.documentId,
        nodeId: currentNode.id,
        nodeKind,
        step: steps,
      });
      const nodeExecutor = nodeKind ? registry.resolve(nodeKind) : undefined;
      if (!nodeExecutor) {
        return finish('unsupported-node', steps, statePatch, input, {
          nodeId: currentNode.id,
          nodeKind,
        });
      }

      const outcome = await nodeExecutor({
        graph,
        node: currentNode,
        input,
        request,
      });
      input = outcome.output;
      statePatch = mergeRuntimeStatePatch(statePatch, outcome.statePatch);
      outcome.trace?.forEach((event) => {
        appendTrace(event.kind === 'log' ? 'log' : 'node-completed', {
          documentId: request.documentId,
          nodeId: currentNode?.id,
          nodeKind,
          ...(event.detail ?? {}),
        });
      });
      appendTrace('node-completed', {
        documentId: request.documentId,
        nodeId: currentNode.id,
        nodeKind,
        step: steps,
      });

      if (outcome.stop) {
        return finish('completed', steps, statePatch, input);
      }
      const nextEdge = resolveNextEdge(
        outgoing.get(currentNode.id) ?? [],
        outcome.nextHandle
      );
      if (!nextEdge) {
        return finish('completed', steps, statePatch, input);
      }
      const nextNode = graph.nodes.find((node) => node.id === nextEdge.target);
      if (!nextNode) {
        return finish('missing-target', steps, statePatch, input, {
          edgeId: nextEdge.id,
          targetNodeId: nextEdge.target,
        });
      }
      currentNode = nextNode;
    }

    return finish('max-steps', steps, statePatch, input, { maxSteps });
  };
};
