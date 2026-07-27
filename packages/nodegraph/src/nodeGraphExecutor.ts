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
  const executorSlotId = node.codeSlot?.slotId.trim();
  if (executorSlotId) return executorSlotId;
  return node.descriptorRef.id;
};

const isControlEdge = (
  graph: NodeGraphDocument,
  edge: NodeGraphEdge
): boolean => {
  const sourceNode = graph.nodes.find((node) => node.id === edge.source.nodeId);
  const targetNode = graph.nodes.find((node) => node.id === edge.target.nodeId);
  const sourcePort = sourceNode?.ports.find(
    (port) => port.id === edge.source.portId
  );
  const targetPort = targetNode?.ports.find(
    (port) => port.id === edge.target.portId
  );
  return (
    sourcePort?.direction === 'output' &&
    sourcePort.flow === 'control' &&
    (!targetPort ||
      (targetPort.direction === 'input' && targetPort.flow === 'control'))
  );
};

const buildControlAdjacency = (graph: NodeGraphDocument) => {
  const outgoing = new Map<string, NodeGraphEdge[]>();
  const incomingCount = new Map<string, number>();
  graph.edges
    .filter((edge) => isControlEdge(graph, edge))
    .forEach((edge) => {
      const current = outgoing.get(edge.source.nodeId) ?? [];
      current.push(edge);
      outgoing.set(edge.source.nodeId, current);
      incomingCount.set(
        edge.target.nodeId,
        (incomingCount.get(edge.target.nodeId) ?? 0) + 1
      );
    });
  return { outgoing, incomingCount };
};

const resolveEntryNode = (
  graph: NodeGraphDocument,
  incomingCount: Map<string, number>
): NodeGraphNode | null =>
  graph.nodes.find((node) => normalizeNodeKind(node) === 'core.start') ??
  graph.nodes.find((node) => (incomingCount.get(node.id) ?? 0) === 0) ??
  null;

const resolveNextEdge = (
  outgoing: NodeGraphEdge[],
  nextPortId: string | undefined
): NodeGraphEdge | undefined => {
  if (!nextPortId) return outgoing[0];
  return outgoing.find((edge) => edge.source.portId === nextPortId);
};

export const createDefaultNodeGraphNodeExecutorRegistry =
  (): NodeGraphNodeExecutorRegistry => {
    const registry = createRuntimeExecutorRegistry<
      NodeGraphNodeExecutionContext,
      NodeGraphNodeExecutionOutcome
    >();
    registry.register('core.start', ({ node, input }) => ({
      output: node.configuration.value ?? input,
    }));
    registry.register('core.process', ({ input }) => ({ output: input }));
    registry.register('core.switch', ({ node, input }) => {
      const selector = node.configuration.value ?? input;
      const cases = Array.isArray(node.configuration.cases)
        ? node.configuration.cases.filter(
            (candidate): candidate is { id: string; label?: string } =>
              Boolean(
                candidate &&
                typeof candidate === 'object' &&
                'id' in candidate &&
                typeof candidate.id === 'string' &&
                candidate.id.trim()
              )
          )
        : [];
      const selectedCase = cases.find(
        (candidate) => candidate.id === selector || candidate.label === selector
      );
      return {
        output: input,
        nextPortId: selectedCase
          ? `out.control.case-${selectedCase.id}`
          : 'out.control.default',
      };
    });
    registry.register('core.log', ({ node, input }) => {
      const output =
        node.configuration.description ?? node.configuration.value ?? input;
      return {
        output,
        trace: [{ kind: 'log', detail: { value: output } }],
      };
    });
    registry.register('core.end', ({ input }) => ({
      output: input,
      stop: true,
    }));
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
      const event = { sequence, kind, detail };
      trace.push(event);
      try {
        options.onTrace?.(event);
      } catch {
        // Execution observation cannot alter deterministic graph semantics.
      }
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
          reason: request.signal.reason ? 'cancelled' : undefined,
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
        outcome.nextPortId
      );
      if (!nextEdge) {
        return finish('completed', steps, statePatch, input);
      }
      const nextNode = graph.nodes.find(
        (node) => node.id === nextEdge.target.nodeId
      );
      const nextPort = nextNode?.ports.find(
        (port) => port.id === nextEdge.target.portId
      );
      if (
        !nextNode ||
        !nextPort ||
        nextPort.direction !== 'input' ||
        nextPort.flow !== 'control'
      ) {
        return finish('missing-target', steps, statePatch, input, {
          edgeId: nextEdge.id,
          targetNodeId: nextEdge.target.nodeId,
          targetPortId: nextEdge.target.portId,
        });
      }
      currentNode = nextNode;
    }

    return finish('max-steps', steps, statePatch, input, { maxSteps });
  };
};
