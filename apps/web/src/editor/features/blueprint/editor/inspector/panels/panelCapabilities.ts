import type { BlueprintInspectorNodeView } from '../projection';

const normalizeNodeType = (type: string) => type.trim().toLowerCase();

export const isContainerNode = (node: BlueprintInspectorNodeView) =>
  normalizeNodeType(node.type) === 'container';

export const isSlotLikeNode = (node: BlueprintInspectorNodeView) => {
  const normalized = normalizeNodeType(node.type);
  return normalized === 'slot' || normalized.endsWith('-slot');
};

export const supportsClassNamePanel = (node: BlueprintInspectorNodeView) =>
  !isContainerNode(node) && !isSlotLikeNode(node);

export const supportsVisualStylePanels = (node: BlueprintInspectorNodeView) =>
  !isContainerNode(node) && !isSlotLikeNode(node);
