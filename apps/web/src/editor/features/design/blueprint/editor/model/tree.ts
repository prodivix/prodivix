import { isNonNestableType } from '@/editor/features/design/blueprint/nesting';
import type { ComponentNode, PIRDocument } from '@prodivix/shared/types/pir';
import { materializeUiTree, normalizeTreeToUiGraph } from '@/pir/graph';
import { defaultComponentRegistry } from '@/pir/renderer/registry';

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

const insertChildById = (
  node: ComponentNode,
  parentId: string,
  child: ComponentNode
): { node: ComponentNode; inserted: boolean } => {
  if (node.id === parentId) {
    const nextChildren = [...(node.children ?? []), child];
    return { node: { ...node, children: nextChildren }, inserted: true };
  }
  if (!node.children?.length) return { node, inserted: false };
  let inserted = false;
  const nextChildren = node.children.map((item) => {
    const result = insertChildById(item, parentId, child);
    if (result.inserted) inserted = true;
    return result.node;
  });
  return inserted
    ? { node: { ...node, children: nextChildren }, inserted: true }
    : { node, inserted: false };
};

export const insertAfterById = (
  node: ComponentNode,
  siblingId: string,
  child: ComponentNode
): { node: ComponentNode; inserted: boolean } => {
  if (!node.children?.length) return { node, inserted: false };
  const idx = node.children.findIndex((item) => item.id === siblingId);
  if (idx >= 0) {
    const nextChildren = [
      ...node.children.slice(0, idx + 1),
      child,
      ...node.children.slice(idx + 1),
    ];
    return { node: { ...node, children: nextChildren }, inserted: true };
  }
  let inserted = false;
  const nextChildren = node.children.map((item) => {
    const result = insertAfterById(item, siblingId, child);
    if (result.inserted) inserted = true;
    return result.node;
  });
  return inserted
    ? { node: { ...node, children: nextChildren }, inserted: true }
    : { node, inserted: false };
};

export const removeNodeById = (
  node: ComponentNode,
  targetId: string
): { node: ComponentNode; removed: boolean } => {
  if (!node.children?.length) return { node, removed: false };
  const idx = node.children.findIndex((item) => item.id === targetId);
  if (idx >= 0) {
    const nextChildren = [
      ...node.children.slice(0, idx),
      ...node.children.slice(idx + 1),
    ];
    return {
      node: {
        ...node,
        children: nextChildren.length > 0 ? nextChildren : undefined,
      },
      removed: true,
    };
  }
  let removed = false;
  const nextChildren = node.children.map((item) => {
    const result = removeNodeById(item, targetId);
    if (result.removed) removed = true;
    return result.node;
  });
  if (!removed) return { node, removed: false };
  return {
    node: {
      ...node,
      children: nextChildren.length > 0 ? nextChildren : undefined,
    },
    removed: true,
  };
};

export const removeNodeByIdWithNode = (
  node: ComponentNode,
  targetId: string
): { node: ComponentNode; removed: boolean; removedNode?: ComponentNode } => {
  if (!node.children?.length) return { node, removed: false };
  const idx = node.children.findIndex((item) => item.id === targetId);
  if (idx >= 0) {
    const removedNode = node.children[idx];
    const nextChildren = [
      ...node.children.slice(0, idx),
      ...node.children.slice(idx + 1),
    ];
    return {
      node: {
        ...node,
        children: nextChildren.length > 0 ? nextChildren : undefined,
      },
      removed: true,
      removedNode,
    };
  }
  let removed = false;
  let removedNode: ComponentNode | undefined;
  const nextChildren = node.children.map((item) => {
    const result = removeNodeByIdWithNode(item, targetId);
    if (result.removed) {
      removed = true;
      removedNode = result.removedNode;
    }
    return result.node;
  });
  if (!removed) return { node, removed: false };
  return {
    node: {
      ...node,
      children: nextChildren.length > 0 ? nextChildren : undefined,
    },
    removed: true,
    removedNode,
  };
};

export const moveChildById = (
  node: ComponentNode,
  parentId: string,
  childId: string,
  direction: 'up' | 'down'
): { node: ComponentNode; moved: boolean } => {
  if (node.id === parentId) {
    const children = node.children ?? [];
    const index = children.findIndex((item) => item.id === childId);
    if (index === -1) return { node, moved: false };
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= children.length)
      return { node, moved: false };
    const nextChildren = [...children];
    const [movedNode] = nextChildren.splice(index, 1);
    nextChildren.splice(nextIndex, 0, movedNode);
    return { node: { ...node, children: nextChildren }, moved: true };
  }
  if (!node.children?.length) return { node, moved: false };
  let moved = false;
  const nextChildren = node.children.map((item) => {
    const result = moveChildById(item, parentId, childId, direction);
    if (result.moved) moved = true;
    return result.node;
  });
  return moved
    ? { node: { ...node, children: nextChildren }, moved: true }
    : { node, moved: false };
};

export const insertChildAtIndex = (
  node: ComponentNode,
  parentId: string,
  child: ComponentNode,
  index: number
): { node: ComponentNode; inserted: boolean } => {
  if (node.id === parentId) {
    const nextChildren = [...(node.children ?? [])];
    const clampedIndex = Math.max(0, Math.min(index, nextChildren.length));
    nextChildren.splice(clampedIndex, 0, child);
    return { node: { ...node, children: nextChildren }, inserted: true };
  }
  if (!node.children?.length) return { node, inserted: false };
  let inserted = false;
  const nextChildren = node.children.map((item) => {
    const result = insertChildAtIndex(item, parentId, child, index);
    if (result.inserted) inserted = true;
    return result.node;
  });
  return inserted
    ? { node: { ...node, children: nextChildren }, inserted: true }
    : { node, inserted: false };
};

const arrayMove = <T>(list: T[], fromIndex: number, toIndex: number) => {
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
};

export const reorderChildById = (
  node: ComponentNode,
  parentId: string,
  activeId: string,
  overId: string
): { node: ComponentNode; moved: boolean } => {
  if (node.id === parentId) {
    const children = node.children ?? [];
    const fromIndex = children.findIndex((item) => item.id === activeId);
    const toIndex = children.findIndex((item) => item.id === overId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex)
      return { node, moved: false };
    const nextChildren = arrayMove(children, fromIndex, toIndex);
    return { node: { ...node, children: nextChildren }, moved: true };
  }
  if (!node.children?.length) return { node, moved: false };
  let moved = false;
  const nextChildren = node.children.map((item) => {
    const result = reorderChildById(item, parentId, activeId, overId);
    if (result.moved) moved = true;
    return result.node;
  });
  return moved
    ? { node: { ...node, children: nextChildren }, moved: true }
    : { node, moved: false };
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

export const cloneNodeWithNewIds = (
  node: ComponentNode,
  createId: (type: string) => string
): ComponentNode => {
  const { children, ...rest } = node;
  const clonedRest =
    typeof structuredClone === 'function'
      ? structuredClone(rest)
      : JSON.parse(JSON.stringify(rest));
  return {
    ...clonedRest,
    id: createId(node.type),
    children: children?.map((child) => cloneNodeWithNewIds(child, createId)),
  };
};

export const supportsChildrenForNode = (node: ComponentNode) => {
  if (isNonNestableType(node.type)) return false;

  // Reuse renderer adapter metadata so drop behavior expands with component registrations.
  const registryEntry = defaultComponentRegistry.get(node.type);
  if (registryEntry?.adapter.isVoid) return false;
  if (registryEntry?.adapter.supportsChildren === false) return false;

  return true;
};

export const insertIntoPirDoc = (
  doc: PIRDocument,
  targetId: string,
  child: ComponentNode
) => {
  const root = materializeUiTree(doc.ui.graph);
  const targetNode = findNodeById(root, targetId);
  const withRoot = (nextRoot: ComponentNode): PIRDocument => ({
    ...doc,
    ui: { graph: normalizeTreeToUiGraph(nextRoot) },
  });
  if (!targetNode) {
    const insertedAtRoot = insertChildById(root, root.id, child);
    return insertedAtRoot.inserted ? withRoot(insertedAtRoot.node) : doc;
  }

  if (supportsChildrenForNode(targetNode)) {
    const insertedChild = insertChildById(root, targetId, child);
    return insertedChild.inserted ? withRoot(insertedChild.node) : doc;
  }

  const insertedSibling = insertAfterById(root, targetId, child);
  if (insertedSibling.inserted) {
    return withRoot(insertedSibling.node);
  }

  const insertedAtRoot = insertChildById(root, root.id, child);
  return insertedAtRoot.inserted ? withRoot(insertedAtRoot.node) : doc;
};
