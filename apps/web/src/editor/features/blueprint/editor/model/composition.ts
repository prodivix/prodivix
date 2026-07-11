import { matchesBlueprintCompositionSequence } from '@prodivix/plugin-contracts';
import type { UiGraph } from '@prodivix/shared/types/pir';
import { getParentMap } from '@/pir/graph';
import type { PaletteQueryService } from '@/plugins/platform';

export type BlueprintCompositionIssue = Readonly<{
  code: 'PIR-2011';
  nodeId: string;
  runtimeType?: string;
  message: string;
}>;

/**
 * Validates the plugin-owned composition rules affected by a graph mutation.
 * Callers pass the changed node and its old/new parents so unrelated legacy
 * nodes cannot block an otherwise valid local edit.
 */
export const validateBlueprintComposition = (
  graph: UiGraph,
  palette: PaletteQueryService,
  affectedNodeIds: Iterable<string>
): BlueprintCompositionIssue | undefined => {
  const parentMap = getParentMap(graph);
  for (const nodeId of new Set(affectedNodeIds)) {
    const node = graph.nodesById[nodeId];
    if (!node) continue;
    const resolved = palette.getCompositionRule(node.type);
    if (!resolved) continue;
    const rule = resolved.rule;
    const parent = parentMap[nodeId];
    const parentType = parent
      ? graph.nodesById[parent.parentId]?.type
      : undefined;
    if (
      rule.parent.mode === 'listed' &&
      (!parentType || !rule.parent.runtimeTypes.includes(parentType))
    ) {
      return Object.freeze({
        code: 'PIR-2011',
        nodeId,
        runtimeType: node.type,
        message: `Runtime type ${node.type} cannot be inserted under ${parentType ?? 'the document root'}.`,
      });
    }
    for (const slot of rule.slots) {
      const childIds =
        slot.target === 'children'
          ? (graph.childIdsById[nodeId] ?? [])
          : (graph.regionsById?.[nodeId]?.[slot.name] ?? []);
      const childTypes = childIds.flatMap((childId) => {
        const child = graph.nodesById[childId];
        return child ? [child.type] : [];
      });
      if (!matchesBlueprintCompositionSequence(slot.sequence, childTypes)) {
        return Object.freeze({
          code: 'PIR-2011',
          nodeId,
          runtimeType: node.type,
          message: `Runtime type ${node.type} violates its ${slot.target} composition sequence.`,
        });
      }
    }
  }
  return undefined;
};
