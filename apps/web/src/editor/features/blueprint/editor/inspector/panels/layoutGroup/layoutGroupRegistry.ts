import type { BlueprintInspectorNodeView } from '../../projection';
import type { LayoutGroupDefinition } from './types';

const layoutGroupRegistry: LayoutGroupDefinition[] = [];

export const registerLayoutGroup = (definition: LayoutGroupDefinition) => {
  const index = layoutGroupRegistry.findIndex(
    (item) => item.key === definition.key
  );
  if (index >= 0) {
    layoutGroupRegistry[index] = definition;
  } else {
    layoutGroupRegistry.push(definition);
  }
};

export const resolveLayoutGroups = (
  node: BlueprintInspectorNodeView,
  display: string | undefined,
  isPatternStructureControlled: boolean
): LayoutGroupDefinition[] => {
  return layoutGroupRegistry
    .filter((group) =>
      group.match
        ? group.match(node, display, isPatternStructureControlled)
        : true
    )
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
};

export const resetLayoutGroupRegistry = () => {
  layoutGroupRegistry.length = 0;
};
