import { matchesBlueprintCompositionSequence } from '@prodivix/plugin-contracts';
import type { PIRNode, PIRUiGraph } from '@prodivix/pir';
import type { PaletteQueryService } from '@/plugins/platform';

export type BlueprintCompositionIssue = Readonly<{
  code: 'PIR-2011';
  nodeId: string;
  runtimeType?: string;
  message: string;
}>;

const runtimeTypeOf = (node: PIRNode | undefined): string | undefined =>
  node?.kind === 'element' ? node.type : undefined;

const createParentByNodeId = (
  graph: PIRUiGraph
): Readonly<Record<string, string>> => {
  const parentByNodeId: Record<string, string> = {};
  for (const [parentId, childIds] of Object.entries(graph.childIdsById)) {
    childIds.forEach((childId) => {
      parentByNodeId[childId] = parentId;
    });
  }
  for (const [parentId, regions] of Object.entries(graph.regionsById ?? {})) {
    Object.values(regions).forEach((childIds) => {
      childIds.forEach((childId) => {
        parentByNodeId[childId] = parentId;
      });
    });
  }
  return parentByNodeId;
};

/** Validates plugin composition rules against the canonical normalized graph. */
export const validateBlueprintComposition = (
  graph: PIRUiGraph,
  palette: PaletteQueryService,
  affectedNodeIds: Iterable<string>
): BlueprintCompositionIssue | undefined => {
  const parentByNodeId = createParentByNodeId(graph);
  for (const nodeId of new Set(affectedNodeIds)) {
    const node = graph.nodesById[nodeId];
    const runtimeType = runtimeTypeOf(node);
    if (!runtimeType) continue;
    const resolved = palette.getCompositionRule(runtimeType);
    if (!resolved) continue;
    const rule = resolved.rule;
    const parentType = runtimeTypeOf(
      graph.nodesById[parentByNodeId[nodeId] ?? '']
    );
    if (
      rule.parent.mode === 'listed' &&
      (!parentType || !rule.parent.runtimeTypes.includes(parentType))
    ) {
      return Object.freeze({
        code: 'PIR-2011',
        nodeId,
        runtimeType,
        message: `Runtime type ${runtimeType} cannot be inserted under ${parentType ?? 'the document root'}.`,
      });
    }
    for (const slot of rule.slots) {
      const childIds =
        slot.target === 'children'
          ? (graph.childIdsById[nodeId] ?? [])
          : (graph.regionsById?.[nodeId]?.[slot.name] ?? []);
      const childTypes = childIds.flatMap((childId) => {
        const childType = runtimeTypeOf(graph.nodesById[childId]);
        return childType ? [childType] : [];
      });
      if (!matchesBlueprintCompositionSequence(slot.sequence, childTypes)) {
        return Object.freeze({
          code: 'PIR-2011',
          nodeId,
          runtimeType,
          message: `Runtime type ${runtimeType} violates its ${slot.target} composition sequence.`,
        });
      }
    }
  }
  return undefined;
};
