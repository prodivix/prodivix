import { useState } from 'react';
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { PIRRenderLocation } from '@prodivix/pir-react-renderer';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type { PaletteItemSelection } from '../model/paletteCreation';
import { getTreeDropPlacement } from '../model/tree';
import { isSamePirRenderLocation } from '../model/tree';
import {
  canNestBlueprintLocation,
  resolveBlueprintInsertionPlacement,
  type BlueprintTreeDropPlacement,
} from './blueprintCanonicalGraph';

type PaletteItemDragData = PaletteItemSelection &
  Readonly<{ kind: 'palette-item'; itemId: string }>;

type TreeSortDragData = Readonly<{
  kind: 'tree-sort';
  location: PIRRenderLocation;
}>;

type LocationDropData = Readonly<{
  kind: 'tree-node' | 'tree-root';
  location: PIRRenderLocation;
}>;

type BlueprintDropHint = Readonly<{
  location: PIRRenderLocation;
  placement: BlueprintTreeDropPlacement;
}> | null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readLocation = (value: unknown): PIRRenderLocation | undefined => {
  if (!isRecord(value)) return undefined;
  const role = value.role;
  if (
    typeof value.documentId !== 'string' ||
    typeof value.nodeId !== 'string' ||
    typeof value.instancePath !== 'string' ||
    (role !== 'source' && role !== 'definition' && role !== 'slot-consumer')
  ) {
    return undefined;
  }
  return {
    documentId: value.documentId,
    nodeId: value.nodeId,
    instancePath: value.instancePath,
    role,
  };
};

const readPaletteData = (value: unknown): PaletteItemDragData | undefined => {
  if (!isRecord(value) || value.kind !== 'palette-item') return undefined;
  if (typeof value.itemId !== 'string' || !value.itemId.trim())
    return undefined;
  return {
    kind: 'palette-item',
    itemId: value.itemId,
    ...(isRecord(value.variantProps)
      ? { variantProps: value.variantProps }
      : {}),
    ...(typeof value.selectedSize === 'string'
      ? { selectedSize: value.selectedSize }
      : {}),
    ...(typeof value.selectedStatus === 'string'
      ? { selectedStatus: value.selectedStatus }
      : {}),
  };
};

const readTreeSortData = (value: unknown): TreeSortDragData | undefined => {
  if (!isRecord(value) || value.kind !== 'tree-sort') return undefined;
  const location = readLocation(value.location);
  return location ? { kind: 'tree-sort', location } : undefined;
};

const readLocationDropData = (value: unknown): LocationDropData | undefined => {
  if (
    !isRecord(value) ||
    (value.kind !== 'tree-node' && value.kind !== 'tree-root')
  ) {
    return undefined;
  }
  const location = readLocation(value.location);
  return location ? { kind: value.kind, location } : undefined;
};

const activeCenterY = (event: DragMoveEvent | DragEndEvent): number => {
  const rect =
    event.active.rect.current.translated ?? event.active.rect.current.initial;
  return rect ? rect.top + rect.height / 2 : Number.NaN;
};

const resolvePlacement = (input: {
  canNest: boolean;
  event: DragMoveEvent | DragEndEvent;
}): BlueprintTreeDropPlacement => {
  const rect = input.event.over?.rect;
  return getTreeDropPlacement({
    canNest: input.canNest,
    overTop: rect?.top ?? Number.NaN,
    overHeight: rect?.height ?? Number.NaN,
    activeCenterY: activeCenterY(input.event),
  });
};

export const useBlueprintCanonicalDragDrop = (input: {
  workspace?: WorkspaceSnapshot;
  selectedLocation?: PIRRenderLocation;
  rootLocation?: PIRRenderLocation;
  onInsertPaletteItem: (
    itemId: string,
    selection: PaletteItemSelection,
    targetLocation?: PIRRenderLocation,
    placement?: BlueprintTreeDropPlacement
  ) => void;
  onMoveTreeNode: (
    source: PIRRenderLocation,
    target: PIRRenderLocation,
    placement: BlueprintTreeDropPlacement
  ) => void;
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const [isDragging, setDragging] = useState(false);
  const [activePaletteItemId, setActivePaletteItemId] = useState<string | null>(
    null
  );
  const [treeDropHint, setTreeDropHint] = useState<BlueprintDropHint>(null);

  const reset = () => {
    setDragging(false);
    setActivePaletteItemId(null);
    setTreeDropHint(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDragging(true);
    const palette = readPaletteData(event.active.data.current);
    setActivePaletteItemId(palette?.itemId ?? null);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const source = readTreeSortData(event.active.data.current);
    const target = readLocationDropData(event.over?.data.current);
    if (
      !input.workspace ||
      !source ||
      !target ||
      isSamePirRenderLocation(source.location, target.location)
    ) {
      setTreeDropHint(null);
      return;
    }
    const placement = resolvePlacement({
      event,
      canNest:
        target.kind === 'tree-root' ||
        canNestBlueprintLocation(
          input.workspace,
          source.location,
          target.location
        ),
    });
    setTreeDropHint({
      location: target.location,
      placement: target.kind === 'tree-root' ? 'child' : placement,
    });
  };

  const handleDragCancel = () => reset();

  const handleDragEnd = (event: DragEndEvent) => {
    const workspace = input.workspace;
    const source = readTreeSortData(event.active.data.current);
    const palette = readPaletteData(event.active.data.current);
    const target = readLocationDropData(event.over?.data.current);
    const overKind = isRecord(event.over?.data.current)
      ? event.over?.data.current.kind
      : undefined;
    reset();

    if (workspace && source && target) {
      if (isSamePirRenderLocation(source.location, target.location)) return;
      input.onMoveTreeNode(
        source.location,
        target.location,
        target.kind === 'tree-root'
          ? 'child'
          : resolvePlacement({
              event,
              canNest: canNestBlueprintLocation(
                workspace,
                source.location,
                target.location
              ),
            })
      );
      return;
    }

    if (!palette) return;
    if (workspace && target) {
      input.onInsertPaletteItem(
        palette.itemId,
        palette,
        target.location,
        target.kind === 'tree-root'
          ? 'child'
          : resolvePlacement({
              event,
              canNest: Boolean(
                resolveBlueprintInsertionPlacement(workspace, target.location)
              ),
            })
      );
      return;
    }
    if (overKind === 'canvas' || overKind === 'tree-root') {
      input.onInsertPaletteItem(
        palette.itemId,
        palette,
        input.selectedLocation ?? input.rootLocation,
        'child'
      );
    }
  };

  return {
    sensors,
    isDragging,
    activePaletteItemId,
    treeDropHint,
    handleDragStart,
    handleDragMove,
    handleDragCancel,
    handleDragEnd,
  };
};
