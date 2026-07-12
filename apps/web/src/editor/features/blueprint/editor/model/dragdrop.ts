import { useState } from 'react';
import type {
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  findNodeById,
  isAncestorOf,
  supportsChildrenForNode,
} from '@/editor/features/blueprint/editor/model/tree';
import { materializePirRoot } from '@prodivix/pir';
import { getOverNodeId, resolveTreePlacement } from './dragdrop.placement';
import { applyTreeSortDragEnd } from './dragdrop.treeMove';
import { applyPaletteItemDrop } from './dragdrop.paletteDrop';
import type { BlueprintCompositionIssue } from './composition';
import type {
  DragActiveData,
  DragOverData,
  PaletteItemDragData,
  TreeDropHint,
  TreeSortDragData,
  UseBlueprintDragDropOptions,
} from './dragdrop.types';

export type {
  TreeDropHint,
  UseBlueprintDragDropOptions,
} from './dragdrop.types';

export const useBlueprintDragDrop = ({
  pirDoc,
  workspaceId,
  documentId,
  documentType,
  selectedId,
  palette,
  updateActivePirDocument,
  dispatchWorkspaceCommand,
  onNodeSelect,
  onCompositionIssue,
}: UseBlueprintDragDropOptions) => {
  const [activePaletteItemId, setActivePaletteItemId] = useState<string | null>(
    null
  );
  const [treeDropHint, setTreeDropHint] = useState<TreeDropHint>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (event: DragStartEvent) => {
    setIsDragging(true);
    const data = event.active.data.current as DragActiveData | undefined;
    if (data?.kind === 'palette-item') {
      setActivePaletteItemId(String((data as PaletteItemDragData).itemId));
    }
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const data = event.active.data.current as DragActiveData | undefined;
    const over = event.over;
    if (!over || data?.kind !== 'tree-sort') {
      setTreeDropHint(null);
      return;
    }

    const root = materializePirRoot(pirDoc);
    if (!root) {
      setTreeDropHint(null);
      return;
    }

    const overData = over.data.current as DragOverData | null | undefined;
    const overId = typeof over.id === 'string' ? over.id : null;
    const overNodeIdRaw = getOverNodeId(overData, overId);
    const overNodeId = typeof overNodeIdRaw === 'string' ? overNodeIdRaw : null;
    if (!overNodeId) {
      setTreeDropHint(null);
      return;
    }

    const activeId = (data as TreeSortDragData).nodeId;
    if (!activeId || activeId === overNodeId) {
      setTreeDropHint(null);
      return;
    }

    const overNode = findNodeById(root, overNodeId);
    if (!overNode) {
      setTreeDropHint(null);
      return;
    }

    const canNest =
      supportsChildrenForNode(overNode) &&
      !isAncestorOf(root, activeId, overNodeId);
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

    setTreeDropHint({ overNodeId, placement });
  };

  const handleDragCancel = () => {
    setIsDragging(false);
    setActivePaletteItemId(null);
    setTreeDropHint(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const data = event.active.data.current as DragActiveData | undefined;
    const over = event.over;
    setIsDragging(false);
    setActivePaletteItemId(null);
    setTreeDropHint(null);
    if (!over) return;

    if (data?.kind === 'tree-sort') {
      let compositionIssue: BlueprintCompositionIssue | undefined;
      let changed = false;
      updateActivePirDocument(
        (doc) => {
          const next = applyTreeSortDragEnd(
            doc,
            event,
            data as TreeSortDragData,
            palette,
            (issue) => {
              compositionIssue = issue;
            }
          );
          changed = next !== doc;
          return next;
        },
        {
          namespace: 'core.blueprint',
          type: 'node.move',
          mergeKey: 'blueprint-tree-move',
          label: 'Move component',
        }
      );
      if (compositionIssue) onCompositionIssue?.(compositionIssue);
      else if (changed) onCompositionIssue?.(undefined);
      return;
    }

    if (data?.kind !== 'palette-item') return;

    const overData = over.data.current as DragOverData | null | undefined;
    const result = applyPaletteItemDrop(
      pirDoc,
      data as PaletteItemDragData,
      overData,
      { workspaceId, documentId, documentType, selectedId, palette }
    );
    const nextNodeId = result.nextNodeId;
    const compositionIssue = result.compositionIssue;
    if (result.command) dispatchWorkspaceCommand(result.command);
    if (compositionIssue) onCompositionIssue?.(compositionIssue);
    else if (nextNodeId) onCompositionIssue?.(undefined);
    if (nextNodeId) {
      onNodeSelect(nextNodeId);
    }
  };

  return {
    isDragging,
    activePaletteItemId,
    treeDropHint,
    handleDragStart,
    handleDragMove,
    handleDragCancel,
    handleDragEnd,
  };
};
