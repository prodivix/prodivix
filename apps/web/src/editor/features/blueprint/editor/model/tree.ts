import { isNonNestableType } from '@/editor/features/blueprint/nesting';
import type { ComponentNode } from '@prodivix/shared/types/pir';
import { defaultComponentRegistry } from '@prodivix/pir-react-renderer';

export type TreeDropPlacement = 'before' | 'after' | 'child';

export const getTreeDropPlacement = (options: {
  canNest: boolean;
  overTop: number;
  overHeight: number;
  activeCenterY: number;
}): TreeDropPlacement => {
  const { canNest, overTop, overHeight, activeCenterY } = options;
  if (
    !Number.isFinite(overTop) ||
    !Number.isFinite(overHeight) ||
    overHeight <= 0 ||
    !Number.isFinite(activeCenterY)
  ) {
    return 'after';
  }

  const rawRatio = (activeCenterY - overTop) / overHeight;
  const ratio = Math.max(0, Math.min(1, rawRatio));

  if (canNest) {
    if (ratio < 1 / 3) return 'before';
    if (ratio > 2 / 3) return 'after';
    return 'child';
  }

  return ratio < 1 / 2 ? 'before' : 'after';
};

export const findParentId = (
  node: ComponentNode,
  targetId: string,
  parentId: string | null = null
): string | null => {
  if (node.id === targetId) return parentId;
  const children = node.children ?? [];
  for (const child of children) {
    const result = findParentId(child, targetId, node.id);
    if (result !== null) return result;
  }
  return null;
};

export const findNodeById = (
  node: ComponentNode,
  nodeId: string
): ComponentNode | null => {
  if (node.id === nodeId) return node;
  const children = node.children ?? [];
  for (const child of children) {
    const found = findNodeById(child, nodeId);
    if (found) return found;
  }
  return null;
};

export const isAncestorOf = (
  root: ComponentNode,
  ancestorId: string,
  targetId: string
) => {
  if (ancestorId === targetId) return true;
  const ancestorNode = findNodeById(root, ancestorId);
  if (!ancestorNode) return false;
  return Boolean(findNodeById(ancestorNode, targetId));
};

export const supportsChildrenForNode = (node: ComponentNode) => {
  if (isNonNestableType(node.type)) return false;

  // Reuse renderer adapter metadata so drop behavior expands with component registrations.
  const registryEntry = defaultComponentRegistry.get(node.type);
  if (registryEntry?.adapter.isVoid) return false;
  if (registryEntry?.adapter.supportsChildren === false) return false;

  return true;
};
