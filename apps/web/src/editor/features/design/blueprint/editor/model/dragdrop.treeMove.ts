import type { DragEndEvent } from '@dnd-kit/core';
import {
  findNodeById,
  findParentId,
  insertChildAtIndex,
  isAncestorOf,
  removeNodeByIdWithNode,
  supportsChildrenForNode,
} from '@/editor/features/design/blueprint/editor/model/tree';
import type { PIRDocument } from '@prodivix/shared/types/pir';
import { materializePirRoot, normalizeTreeToUiGraph } from '@/pir/graph';
import { getOverNodeId, resolveTreePlacement } from './dragdrop.placement';
import type { DragOverData, TreeSortDragData } from './dragdrop.types';

export const applyTreeSortDragEnd = (
  doc: PIRDocument,
  event: DragEndEvent,
  data: TreeSortDragData
): PIRDocument => {
  const over = event.over;
  if (!over) return doc;

  const overData = over.data.current as DragOverData | null | undefined;
  const overId = typeof over.id === 'string' ? over.id : null;
  const activeId = data.nodeId;
  const activeParentId = data.parentId;
  if (!activeId || !activeParentId) return doc;

  const root = materializePirRoot(doc);
  if (activeId === root.id) return doc;

  const overNodeIdRaw = getOverNodeId(overData, overId);
  const isOverRoot = overId === 'tree-root' || overData?.kind === 'tree-root';
  const overNodeId = typeof overNodeIdRaw === 'string' ? overNodeIdRaw : null;
  if (overNodeId === activeId) return doc;

  const overNode = overNodeId ? findNodeById(root, overNodeId) : null;
  const canNest = Boolean(overNode && supportsChildrenForNode(overNode));
  const translated =
    event.active.rect?.current?.translated ??
    event.active.rect?.current?.initial;
  const activeCenterY = translated
    ? translated.top + translated.height / 2
    : Number.NaN;
  const placement = resolveTreePlacement({
    canNest,
    overData,
    overRect: over.rect,
    activeCenterY,
  });

  let targetParentId: string | null = null;
  let targetIndex: number | null = null;

  if (isOverRoot) {
    targetParentId = root.id;
    targetIndex = root.children?.length ?? 0;
  } else if (overNode) {
    if (overNode.id === root.id) {
      targetParentId = root.id;
      targetIndex = root.children?.length ?? 0;
    } else if (placement === 'child' && canNest) {
      targetParentId = overNode.id;
      targetIndex = overNode.children?.length ?? 0;
    } else {
      const parentId = findParentId(root, overNode.id);
      if (!parentId) return doc;
      const parentNode = findNodeById(root, parentId);
      const siblings = parentNode?.children ?? [];
      const overIndex = siblings.findIndex((item) => item.id === overNode.id);
      if (overIndex === -1) return doc;
      targetParentId = parentId;
      targetIndex = placement === 'before' ? overIndex : overIndex + 1;
    }
  }

  if (!targetParentId || targetIndex === null) return doc;
  if (isAncestorOf(root, activeId, targetParentId)) return doc;

  let adjustedIndex = targetIndex;
  if (targetParentId === activeParentId) {
    const parentNode = findNodeById(root, targetParentId);
    const siblings = parentNode?.children ?? [];
    const fromIndex = siblings.findIndex((item) => item.id === activeId);
    if (fromIndex === -1) return doc;
    if (fromIndex < targetIndex) adjustedIndex = targetIndex - 1;
    if (fromIndex === adjustedIndex) return doc;
  }

  const removal = removeNodeByIdWithNode(root, activeId);
  if (!removal.removed || !removal.removedNode) return doc;
  const insertion = insertChildAtIndex(
    removal.node,
    targetParentId,
    removal.removedNode,
    adjustedIndex
  );
  return insertion.inserted
    ? { ...doc, ui: { graph: normalizeTreeToUiGraph(insertion.node) } }
    : doc;
};
