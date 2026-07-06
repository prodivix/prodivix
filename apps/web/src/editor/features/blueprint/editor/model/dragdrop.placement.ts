import {
  getTreeDropPlacement,
  type TreeDropPlacement,
} from '@/editor/features/blueprint/editor/model/tree';
import type { DragOverData } from './dragdrop.types';

export const getOverNodeId = (
  overData: DragOverData | null | undefined,
  overId: string | null
): string | null => {
  if (overData?.kind === 'tree-sort')
    return (overData as { nodeId?: string }).nodeId ?? null;
  if (overData?.kind === 'tree-node')
    return (overData as { nodeId?: string }).nodeId ?? null;
  if (overId?.startsWith('tree-node:'))
    return overId.slice('tree-node:'.length);
  return null;
};

export const resolveTreePlacement = (options: {
  canNest: boolean;
  overData: DragOverData | null | undefined;
  overRect: { top: number; height: number } | null | undefined;
  activeCenterY: number;
}): TreeDropPlacement => {
  const { canNest, overData, overRect, activeCenterY } = options;
  const hasGeometry = Boolean(
    overRect &&
    Number.isFinite(overRect.top) &&
    Number.isFinite(overRect.height) &&
    overRect.height > 0 &&
    Number.isFinite(activeCenterY)
  );
  if (hasGeometry && overRect) {
    return getTreeDropPlacement({
      canNest,
      overTop: overRect.top,
      overHeight: overRect.height,
      activeCenterY,
    });
  }
  if (overData?.kind === 'tree-sort') {
    return canNest ? 'child' : 'after';
  }
  if (overData?.kind === 'tree-node') {
    return canNest ? 'child' : 'after';
  }
  return 'after';
};
