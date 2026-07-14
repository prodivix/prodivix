import type { MouseEvent as ReactMouseEvent } from 'react';
import type { PluginDiagnostic } from '@prodivix/plugin-contracts';
import type { PIRRenderLocation } from '@prodivix/pir-react-renderer';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type { BlueprintCompositionIssue } from '@/editor/features/blueprint/editor/model/composition';
import type {
  BlueprintTreeProjectionNode,
  TreeDropPlacement,
} from '@/editor/features/blueprint/editor/model/tree';

export type BlueprintEditorComponentTreeProps = {
  workspace: WorkspaceSnapshot;
  entryDocumentId: string;
  isCollapsed: boolean;
  isTreeCollapsed?: boolean;
  selectedLocation?: PIRRenderLocation;
  hiddenLocations?: readonly PIRRenderLocation[];
  dropHint?: {
    location: PIRRenderLocation;
    placement: TreeDropPlacement;
  } | null;
  compositionIssue?: BlueprintCompositionIssue;
  pluginDiagnostics?: readonly PluginDiagnostic[];
  onToggleCollapse: () => void;
  onSelectNode: (location: PIRRenderLocation) => void;
  onDeleteSelected: () => void;
  onDeleteNode: (location: PIRRenderLocation) => void;
  onCopyNode: (location: PIRRenderLocation) => void;
  onMoveNode: (location: PIRRenderLocation, direction: 'up' | 'down') => void;
  onToggleNodeHidden: (location: PIRRenderLocation) => void;
  onOpenRoutePath: (path: string) => void;
};

export type TreeNodeProps = {
  item: BlueprintTreeProjectionNode;
  depth: number;
  expandedKeys: string[];
  outletRoutePaths: Record<string, string>;
  selectedLocation?: PIRRenderLocation;
  hiddenLocations: readonly PIRRenderLocation[];
  dropHint?: {
    location: PIRRenderLocation;
    placement: TreeDropPlacement;
  } | null;
  rootLocation?: PIRRenderLocation;
  openMenuId?: string | null;
  onMenuAction?: (location: PIRRenderLocation) => void;
  onToggle: (location: PIRRenderLocation) => void;
  onSelect: (location: PIRRenderLocation) => void;
  onDelete: (location: PIRRenderLocation) => void;
  onCopy: (location: PIRRenderLocation) => void;
  onMove: (location: PIRRenderLocation, direction: 'up' | 'down') => void;
  onToggleHidden: (location: PIRRenderLocation) => void;
  onOpenRoutePath: (path: string) => void;
  onOpenContextMenu: (
    item: BlueprintTreeProjectionNode,
    event: ReactMouseEvent<HTMLDivElement>
  ) => void;
};

export type TreeContextMenuState = {
  item: BlueprintTreeProjectionNode;
  x: number;
  y: number;
};

export type TreeContextMenuAction =
  'expand' | 'expandRecursive' | 'collapse' | 'collapseRecursive';

export type TreeContextMenuAvailability = {
  canExpand: boolean;
  canExpandRecursive: boolean;
  canCollapse: boolean;
  canCollapseRecursive: boolean;
};
