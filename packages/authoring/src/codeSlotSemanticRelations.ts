import type { CodeSlotRegistry } from './codeSlotRegistry';
import type {
  SemanticImpact,
  SemanticResolutionStatus,
  WorkspaceReferenceEdge,
  WorkspaceSemanticIndex,
  WorkspaceSymbol,
} from './semantic';
import type {
  CodeSlotBindingProjection,
  CodeSlotContract,
} from './authoring.types';

export type CodeSlotSemanticRelationsResult =
  | Readonly<{ status: 'slot-missing'; slotId: string }>
  | Readonly<{ status: 'unbound'; slot: CodeSlotContract }>
  | Readonly<{
      status: 'reference-missing';
      slot: CodeSlotContract;
      projection: CodeSlotBindingProjection;
    }>
  | Readonly<{
      status: 'unresolved';
      resolutionStatus: Exclude<SemanticResolutionStatus, 'resolved' | 'stale'>;
      slot: CodeSlotContract;
      projection: CodeSlotBindingProjection;
    }>
  | Readonly<{
      status: 'stale';
      slot: CodeSlotContract;
      projection: CodeSlotBindingProjection;
    }>
  | Readonly<{
      status: 'resolved';
      slot: CodeSlotContract;
      projection: CodeSlotBindingProjection;
      definition: WorkspaceSymbol;
      references: readonly WorkspaceReferenceEdge[];
      impact: SemanticImpact;
    }>;

/**
 * Joins a domain-owned CodeSlot binding to the common semantic relation graph.
 * Callers can render definition, references, and impact without inspecting a
 * PIR, NodeGraph, Animation, or Route document directly.
 */
export const queryCodeSlotSemanticRelations = (input: {
  registry: CodeSlotRegistry;
  semanticIndex: WorkspaceSemanticIndex;
  slotId: string;
}): CodeSlotSemanticRelationsResult => {
  const slot = input.registry.getSlot(input.slotId);
  if (!slot) return { status: 'slot-missing', slotId: input.slotId };
  const projection = input.registry.getBindingProjection(input.slotId);
  if (!projection) return { status: 'unbound', slot };
  const options = {
    expectedSnapshotIdentity: input.semanticIndex.snapshotIdentity,
  };
  const definition = input.semanticIndex.getDefinition(
    projection.semanticReferenceId,
    options
  );
  if (definition.status === 'stale') {
    return { status: 'stale', slot, projection };
  }
  if (definition.status === 'missing') {
    return { status: 'reference-missing', slot, projection };
  }
  if (definition.status !== 'resolved') {
    return {
      status: 'unresolved',
      resolutionStatus: definition.status,
      slot,
      projection,
    };
  }

  const references = input.semanticIndex.getReferences(
    definition.symbol.id,
    options
  );
  const impact = input.semanticIndex.getImpact([definition.symbol.id], options);
  if (references.status === 'stale' || impact.status === 'stale') {
    return { status: 'stale', slot, projection };
  }
  if (references.status === 'missing' || impact.status === 'missing') {
    return { status: 'reference-missing', slot, projection };
  }
  return {
    status: 'resolved',
    slot,
    projection,
    definition: definition.symbol,
    references: references.references,
    impact: impact.impact,
  };
};
