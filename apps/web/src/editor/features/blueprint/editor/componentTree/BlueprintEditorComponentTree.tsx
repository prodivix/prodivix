import type { MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Layers, Trash2 } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import {
  composeRouteManifestWithModules,
  flattenRouteManifest,
} from '@prodivix/router';
import { selectWorkspacePirDocument } from '@prodivix/workspace';
import {
  createBlueprintTreeProjection,
  isSamePirRenderLocation,
  pirRenderLocationKey,
  type BlueprintTreeProjectionNode,
} from '@/editor/features/blueprint/editor/model/tree';
import { BlueprintTreeNode } from './BlueprintTreeNode';
import {
  collectBranchExpandedKeys,
  CONTEXT_MENU_HEIGHT_PX,
  CONTEXT_MENU_VIEWPORT_GAP_PX,
  CONTEXT_MENU_WIDTH_PX,
  countNodes,
  findAncestorIds,
} from './componentTreeHelpers';
import type {
  BlueprintEditorComponentTreeProps,
  TreeContextMenuAction,
  TreeContextMenuAvailability,
  TreeContextMenuState,
} from './componentTreeTypes';
import { TreeContextMenu } from './TreeContextMenu';
import {
  headerCollapseButtonClassName,
  leftCollapsedButtonClassName,
} from '../collapseButtonStyles';

export function BlueprintEditorComponentTree({
  workspace,
  entryDocumentId,
  isCollapsed,
  isTreeCollapsed = false,
  selectedLocation,
  hiddenLocations = [],
  dropHint,
  compositionIssue,
  pluginDiagnostics = [],
  onToggleCollapse,
  onSelectNode,
  onDeleteSelected,
  onDeleteNode,
  onCopyNode,
  onMoveNode,
  onToggleNodeHidden,
  onOpenRoutePath,
}: BlueprintEditorComponentTreeProps) {
  const { t } = useTranslation('blueprint');
  const documentRead = useMemo(
    () => selectWorkspacePirDocument(workspace, entryDocumentId),
    [entryDocumentId, workspace]
  );
  const rootNode = useMemo(
    () =>
      documentRead?.status === 'valid'
        ? createBlueprintTreeProjection(
            entryDocumentId,
            documentRead.decodedContent
          )
        : null,
    [documentRead, entryDocumentId]
  );
  const outletRoutePaths = useMemo(() => {
    const result: Record<string, string> = {};
    const composedManifest = composeRouteManifestWithModules(
      workspace.routeManifest
    ).manifest;
    flattenRouteManifest(composedManifest).forEach((route) => {
      if (route.node.outletNodeId?.trim()) {
        result[route.node.outletNodeId] = route.path;
      }
      Object.values(route.node.outletBindings ?? {}).forEach((binding) => {
        if (binding.outletNodeId?.trim()) {
          result[binding.outletNodeId] = route.path;
        }
      });
    });
    return result;
  }, [workspace.routeManifest]);
  const isDeleteDisabled =
    !selectedLocation ||
    !rootNode ||
    isSamePirRenderLocation(selectedLocation, rootNode.location);
  const { setNodeRef: setRootDropRef, isOver: isOverRoot } = useDroppable({
    id: 'tree-root',
    data: { kind: 'tree-root', location: rootNode?.location },
    disabled: !rootNode,
  });
  const totalNodes = useMemo(
    () => (rootNode ? countNodes(rootNode) : 0),
    [rootNode]
  );
  const defaultExpandedKeys = useMemo(
    () =>
      rootNode && rootNode.children.length ? [rootNode.location.nodeId] : [],
    [rootNode]
  );
  const [expandedKeys, setExpandedKeys] =
    useState<string[]>(defaultExpandedKeys);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<TreeContextMenuState | null>(
    null
  );
  const menuHoldTimer = useRef<number | null>(null);
  const rootIdRef = useRef(rootNode?.location.nodeId);

  useEffect(() => {
    const nextRootId = rootNode?.location.nodeId;
    if (rootIdRef.current === nextRootId) return;
    rootIdRef.current = nextRootId;
    setExpandedKeys(defaultExpandedKeys);
  }, [defaultExpandedKeys, rootNode?.location.nodeId]);

  useEffect(() => {
    if (
      !rootNode ||
      !selectedLocation ||
      selectedLocation.documentId !== entryDocumentId
    ) {
      return;
    }
    const ancestors = findAncestorIds(rootNode, selectedLocation.nodeId) ?? [];
    if (ancestors.length === 0) return;
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      let changed = false;
      ancestors.forEach((id) => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      return changed ? Array.from(next) : prev;
    });
  }, [entryDocumentId, rootNode, selectedLocation]);

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      if (menuHoldTimer.current) {
        window.clearTimeout(menuHoldTimer.current);
        menuHoldTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!contextMenu || typeof window === 'undefined') return;

    const closeContextMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeContextMenu();
    };

    document.addEventListener('pointerdown', closeContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);

    return () => {
      document.removeEventListener('pointerdown', closeContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
    };
  }, [contextMenu]);

  const holdMenuOpen = (location: BlueprintTreeProjectionNode['location']) => {
    const locationKey = pirRenderLocationKey(location);
    setOpenMenuId(locationKey);
    if (typeof window === 'undefined') return;
    if (menuHoldTimer.current) {
      window.clearTimeout(menuHoldTimer.current);
    }
    menuHoldTimer.current = window.setTimeout(() => {
      setOpenMenuId((prev) => (prev === locationKey ? null : prev));
    }, 350);
  };

  const handleToggle = (location: BlueprintTreeProjectionNode['location']) => {
    const nodeId = location.nodeId;
    setExpandedKeys((prev) =>
      prev.includes(nodeId)
        ? prev.filter((id) => id !== nodeId)
        : [...prev, nodeId]
    );
  };

  const openContextMenu = (
    item: BlueprintTreeProjectionNode,
    event: ReactMouseEvent<HTMLDivElement>
  ) => {
    const viewportWidth =
      typeof window === 'undefined' ? Infinity : window.innerWidth;
    const viewportHeight =
      typeof window === 'undefined' ? Infinity : window.innerHeight;
    setOpenMenuId(null);
    setContextMenu({
      item,
      x: Math.max(
        CONTEXT_MENU_VIEWPORT_GAP_PX,
        Math.min(
          event.clientX,
          viewportWidth - CONTEXT_MENU_WIDTH_PX - CONTEXT_MENU_VIEWPORT_GAP_PX
        )
      ),
      y: Math.max(
        CONTEXT_MENU_VIEWPORT_GAP_PX,
        Math.min(
          event.clientY,
          viewportHeight - CONTEXT_MENU_HEIGHT_PX - CONTEXT_MENU_VIEWPORT_GAP_PX
        )
      ),
    });
  };

  const runContextMenuAction = (action: TreeContextMenuAction) => {
    if (!contextMenu) return;
    const item = contextMenu.item;
    const branchKeys = collectBranchExpandedKeys(item);

    setExpandedKeys((prev) => {
      const next = new Set(prev);

      switch (action) {
        case 'expand':
          next.add(item.location.nodeId);
          break;
        case 'expandRecursive':
          branchKeys.forEach((id) => next.add(id));
          break;
        case 'collapse':
          next.delete(item.location.nodeId);
          break;
        case 'collapseRecursive':
          branchKeys.forEach((id) => next.delete(id));
          break;
      }

      return Array.from(next);
    });
    setContextMenu(null);
  };

  const getContextMenuAvailability = (
    item: BlueprintTreeProjectionNode
  ): TreeContextMenuAvailability => {
    const branchKeys = collectBranchExpandedKeys(item);
    const expandedSet = new Set(expandedKeys);
    const isExpanded = expandedSet.has(item.location.nodeId);
    const isBranchFullyExpanded = branchKeys.every((id) => expandedSet.has(id));
    const isBranchFullyCollapsed = branchKeys.every(
      (id) => !expandedSet.has(id)
    );

    return {
      canExpand: !isExpanded,
      canExpandRecursive: !isBranchFullyExpanded,
      canCollapse: isExpanded,
      canCollapseRecursive: !isBranchFullyCollapsed,
    };
  };

  const contextMenuAvailability = contextMenu
    ? getContextMenuAvailability(contextMenu.item)
    : null;

  if (isCollapsed) {
    return (
      <aside className="BlueprintEditorComponentTree Collapsed absolute bottom-10 left-0 z-[6] h-0 w-0 overflow-visible border-0 bg-transparent shadow-none">
        <button
          type="button"
          className={`BlueprintEditorTreeExpand ${leftCollapsedButtonClassName}`}
          onClick={onToggleCollapse}
          aria-label={t('tree.expand', {
            defaultValue: 'Expand component tree',
          })}
          title={t('tree.expand', {
            defaultValue: 'Expand component tree',
          })}
        >
          <Layers size={15} />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={`BlueprintEditorComponentTree absolute bottom-0 left-0 z-[3] flex h-[var(--component-tree-height)] min-h-0 w-[var(--tree-width)] flex-col overflow-hidden rounded-xl border-0 bg-(--bg-canvas) shadow-(--shadow-sm) ${!isTreeCollapsed ? 'rounded-t-none' : ''}`}
    >
      <div className="BlueprintEditorTreeHeader flex items-center justify-between bg-transparent px-2.5 pt-2.5 pb-1.5 text-[13px] font-medium">
        <div className="BlueprintEditorTreeHeaderLeft inline-flex min-w-0 items-center gap-2">
          <span
            className="BlueprintEditorTreeHeaderIcon inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-md bg-transparent text-(--text-muted)"
            aria-hidden="true"
          >
            <Layers size={14} />
          </span>
          <span>{t('tree.title', { defaultValue: 'Component Tree' })}</span>
          {totalNodes > 0 && (
            <span
              className="BlueprintEditorTreeHeaderCount inline-flex h-[18px] flex-none items-center justify-center rounded-full bg-transparent px-1.5 text-[10px] font-bold text-(--text-muted) tabular-nums"
              aria-label={`${totalNodes} nodes`}
            >
              {totalNodes}
            </span>
          )}
        </div>
        <div className="BlueprintEditorTreeHeaderActions inline-flex items-center gap-1">
          <button
            type="button"
            className="BlueprintEditorTreeAction Danger inline-flex items-center justify-center gap-1.5 rounded-full border-0 bg-transparent px-1.5 py-0.5 text-(--danger-color) hover:text-(--danger-hover) disabled:cursor-not-allowed disabled:text-(--text-muted) disabled:opacity-45"
            onClick={onDeleteSelected}
            disabled={isDeleteDisabled}
            aria-label={t('tree.deleteSelected', {
              defaultValue: 'Delete selected component',
            })}
            title={t('tree.deleteSelected', {
              defaultValue: 'Delete selected component',
            })}
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            className={`BlueprintEditorCollapse ${headerCollapseButtonClassName}`}
            onClick={onToggleCollapse}
            aria-label={t('tree.collapse', {
              defaultValue: 'Collapse component tree',
            })}
            title={t('tree.collapse', {
              defaultValue: 'Collapse component tree',
            })}
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
      {pluginDiagnostics.map((diagnostic) => (
        <div
          key={`${diagnostic.code}-${String(diagnostic.meta.nodeId)}`}
          className="mx-2 mb-1 rounded border border-(--danger-color) px-2 py-1.5 text-[10px] text-(--danger-color)"
          role="status"
          aria-live="polite"
        >
          <span className="mr-1 font-medium">[{diagnostic.code}]</span>
          <span>{diagnostic.message}</span>
        </div>
      ))}
      {compositionIssue ? (
        <div
          className="mx-2 mb-1 rounded border border-(--danger-color) px-2 py-1.5 text-[10px] text-(--danger-color)"
          role="status"
          aria-live="polite"
        >
          <span className="mr-1 font-medium">[{compositionIssue.code}]</span>
          <span>{compositionIssue.message}</span>
        </div>
      ) : null}
      <div
        className={`BlueprintEditorTreeBody min-h-0 flex-1 overflow-auto px-2 pt-1 pb-1.5 ${isOverRoot ? 'IsOver' : ''}`}
        ref={setRootDropRef}
      >
        {rootNode ? (
          <div className="BlueprintEditorTreeList flex flex-col gap-px p-0">
            <BlueprintTreeNode
              item={rootNode}
              depth={0}
              expandedKeys={expandedKeys}
              outletRoutePaths={outletRoutePaths}
              selectedLocation={selectedLocation}
              hiddenLocations={hiddenLocations}
              dropHint={dropHint}
              rootLocation={rootNode.location}
              openMenuId={openMenuId}
              onMenuAction={holdMenuOpen}
              onToggle={handleToggle}
              onSelect={onSelectNode}
              onDelete={onDeleteNode}
              onCopy={onCopyNode}
              onMove={onMoveNode}
              onToggleHidden={onToggleNodeHidden}
              onOpenRoutePath={onOpenRoutePath}
              onOpenContextMenu={openContextMenu}
            />
          </div>
        ) : (
          <div className="BlueprintEditorTreePlaceholder px-2 py-3 text-center text-xs text-(--text-muted)">
            <p>
              {t('tree.empty', {
                defaultValue: 'No components yet.',
              })}
            </p>
          </div>
        )}
      </div>
      {contextMenu && contextMenuAvailability ? (
        <TreeContextMenu
          menu={contextMenu}
          availability={contextMenuAvailability}
          onAction={runContextMenuAction}
        />
      ) : null}
    </aside>
  );
}
