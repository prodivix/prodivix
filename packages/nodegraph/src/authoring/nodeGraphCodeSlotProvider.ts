import {
  createSemanticId,
  type AuthoringContext,
  type CodeSlotBindingProjection,
  type CodeSlotContract,
  type CodeSlotProvider,
} from '@prodivix/authoring';
import type { NodeGraphDocument } from '../nodeGraph.types';

export const createNodeGraphExecutorCodeSlotId = (
  documentId: string,
  nodeId: string
): string =>
  createSemanticId('nodegraph-code-slot', documentId, nodeId, 'executor');

export const createNodeGraphExecutorCodeReferenceId = (
  workspaceId: string,
  documentId: string,
  nodeId: string
): string =>
  createSemanticId(
    'nodegraph-executor-reference',
    workspaceId,
    documentId,
    nodeId
  );

const matchesContext = (
  context: AuthoringContext,
  documentId: string,
  nodeId: string,
  artifactId?: string
): boolean => {
  const target = context.targetRef;
  return (
    (!target ||
      ((target.kind === 'nodegraph-node' || target.kind === 'nodegraph-port') &&
        target.documentId === documentId &&
        target.nodeId === nodeId)) &&
    (!context.artifactId || context.artifactId === artifactId)
  );
};

/** Projects custom executor slots while the NodeGraph document owns bindings. */
export const createNodeGraphCodeSlotProvider = (input: {
  workspaceId: string;
  documentId: string;
  graph: NodeGraphDocument;
}): CodeSlotProvider => {
  const slots: CodeSlotContract[] = [];
  const bindings: CodeSlotBindingProjection[] = [];

  for (const node of [...input.graph.nodes].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    const slot: CodeSlotContract = {
      id:
        node.executor?.slotId ??
        createNodeGraphExecutorCodeSlotId(input.documentId, node.id),
      ownerRef: {
        kind: 'nodegraph-node',
        documentId: input.documentId,
        nodeId: node.id,
      },
      kind: 'node-executor',
      inputTypeRef: 'NodeGraphNodeExecutionContext',
      outputTypeRef:
        'NodeGraphNodeExecutionOutcome | Promise<NodeGraphNodeExecutionOutcome>',
      capabilityIds: ['nodegraph-executor'],
      defaultPlacement: ['nodegraph', 'code-editor', 'issues-panel'],
    };
    slots.push(slot);
    if (!node.executor) continue;
    bindings.push({
      binding: node.executor,
      ownerRef: slot.ownerRef,
      semanticReferenceId: createNodeGraphExecutorCodeReferenceId(
        input.workspaceId,
        input.documentId,
        node.id
      ),
    });
  }

  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const bindingsById = new Map(
    bindings.map((projection) => [projection.binding.slotId, projection])
  );

  return {
    id: `core.nodegraph.code-slots.${input.documentId}`,
    source: { kind: 'nodegraph', documentId: input.documentId },
    listSlots(context) {
      return slots.filter((slot) => {
        const owner = slot.ownerRef;
        return (
          owner.kind === 'nodegraph-node' &&
          matchesContext(
            context,
            owner.documentId,
            owner.nodeId,
            bindingsById.get(slot.id)?.binding.reference.artifactId
          )
        );
      });
    },
    getSlot(id) {
      return slotsById.get(id) ?? null;
    },
    listBindingProjections(context) {
      return bindings.filter((projection) => {
        const owner = projection.ownerRef;
        return (
          owner.kind === 'nodegraph-node' &&
          matchesContext(
            context,
            owner.documentId,
            owner.nodeId,
            projection.binding.reference.artifactId
          )
        );
      });
    },
    getBindingProjection(id) {
      return bindingsById.get(id) ?? null;
    },
  };
};
