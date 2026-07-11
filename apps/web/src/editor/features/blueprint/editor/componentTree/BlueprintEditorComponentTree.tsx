import type { MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Layers, Trash2 } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import type { ComponentNode } from '@prodivix/shared/types/pir';
import {
  composeRouteManifestWithModules,
  flattenRouteManifest,
} from '@prodivix/shared/router';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { materializePirRoot } from '@/pir/graph';
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
  isCollapsed,
  isTreeCollapsed = false,
  selectedId,
  hiddenNodeIds,
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
  const pirDoc = useEditorStore((state) => state.pirDoc);
  const routeManifest = useEditorStore((state) => state.routeManifest);
  const rootNode = useMemo(() => materializePirRoot(pirDoc), [pirDoc]);
  const outletRoutePaths = useMemo(() => {
    const result: Record<string, string> = {};
    const composedManifest =
      composeRouteManifestWithModules(routeManifest).manifest;
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
  }, [routeManifest]);
  const isDeleteDisabled =
    !selectedId || !rootNode || selectedId === rootNode.id;
  const { setNodeRef: setRootDropRef, isOver: isOverRoot } = useDroppable({
    id: 'tree-root',
    data: { kind: 'tree-root' },
  });
  const totalNodes = useMemo(
    () => (rootNode ? countNodes(rootNode) : 0),
    [rootNode]
  );
  const defaultExpandedKeys = useMemo(
    () => (rootNode && rootNode.children?.length ? [rootNode.id] : []),
    [rootNode]
  );
  const [expandedKeys, setExpandedKeys] =
    useState<string[]>(defaultExpandedKeys);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<TreeContextMenuState | null>(
    null
  );
  const menuHoldTimer = useRef<number | null>(null);
  const rootIdRef = useRef(rootNode?.id);

  useEffect(() => {
    const nextRootId = rootNode?.id;
    if (rootIdRef.current === nextRootId) return;
    rootIdRef.current = nextRootId;
    setExpandedKeys(defaultExpandedKeys);
  }, [defaultExpandedKeys, rootNode?.id]);

  useEffect(() => {
    if (!rootNode || !selectedId) return;
    const ancestors = findAncestorIds(rootNode, selectedId) ?? [];
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
  }, [rootNode, selectedId]);

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

  const holdMenuOpen = (nodeId: string) => {
    setOpenMenuId(nodeId);
    if (typeof window === 'undefined') return;
    if (menuHoldTimer.current) {
      window.clearTimeout(menuHoldTimer.current);
    }
    menuHoldTimer.current = window.setTimeout(() => {
      setOpenMenuId((prev) => (prev === nodeId ? null : prev));
    }, 350);
  };

  const handleToggle = (nodeId: string) => {
    setExpandedKeys((prev) =>
      prev.includes(nodeId)
        ? prev.filter((id) => id !== nodeId)
        : [...prev, nodeId]
    );
  };

  const openContextMenu = (
    node: ComponentNode,
    event: ReactMouseEvent<HTMLDivElement>
  ) => {
    const viewportWidth =
      typeof window === 'undefined' ? Infinity : window.innerWidth;
    const viewportHeight =
      typeof window === 'undefined' ? Infinity : window.innerHeight;
    setOpenMenuId(null);
    setContextMenu({
      node,
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
    const node = contextMenu.node;
    const branchKeys = collectBranchExpandedKeys(node);

    setExpandedKeys((prev) => {
      const next = new Set(prev);

      switch (action) {
        case 'expand':
          next.add(node.id);
          break;
        case 'expandRecursive':
          branchKeys.forEach((id) => next.add(id));
          break;
        case 'collapse':
          next.delete(node.id);
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
    node: ComponentNode
  ): TreeContextMenuAvailability => {
    const branchKeys = collectBranchExpandedKeys(node);
    const expandedSet = new Set(expandedKeys);
    const isExpanded = expandedSet.has(node.id);
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
    ? getContextMenuAvailability(contextMenu.node)
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
              node={rootNode}
              depth={0}
              expandedKeys={expandedKeys}
              outletRoutePaths={outletRoutePaths}
              selectedId={selectedId}
              hiddenNodeIds={hiddenNodeIds}
              dropHint={dropHint}
              rootId={rootNode.id}
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
