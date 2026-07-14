import type { BlueprintTreeProjectionNode } from '@/editor/features/blueprint/editor/model/tree';

export const findTreeProjectionNode = (
  projection: BlueprintTreeProjectionNode,
  nodeId: string
): BlueprintTreeProjectionNode | null => {
  if (projection.node.id === nodeId) return projection;
  for (const child of projection.children) {
    const found = findTreeProjectionNode(child, nodeId);
    if (found) return found;
  }
  return null;
};

export const collectTreeProjectionIds = (
  projection: BlueprintTreeProjectionNode,
  result = new Set<string>()
): Set<string> => {
  result.add(projection.node.id);
  projection.children.forEach((child) =>
    collectTreeProjectionIds(child, result)
  );
  return result;
};
