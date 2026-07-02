import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, GripVertical, Layers } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  getLayoutPatternId,
  isLayoutPatternRootNode,
} from '@/editor/features/design/blueprint/layoutPatterns/dataAttributes';
import {
  formatPatternLabel,
  getNodeIcon,
  INDENT_PX,
  isHiddenBySplitCategory,
  NODE_SELECT_DELAY_MS,
} from './componentTreeHelpers';
import type { TreeNodeProps } from './componentTreeTypes';
import { TreeNodeActions } from './TreeNodeActions';

export function BlueprintTreeNode({
  node,
  depth,
  expandedKeys,
  outletRoutePaths,
  selectedId,
  hiddenNodeIds,
  dropHint,
  rootId,
  parentId,
  openMenuId,
  onMenuAction,
  onToggle,
  onSelect,
  onDelete,
  onCopy,
  onMove,
  onToggleHidden,
  onOpenContextMenu,
}: TreeNodeProps) {
  const children = node.children ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedKeys.includes(node.id);
  const layoutPatternId = getLayoutPatternId(node);
  const isLayoutPatternRoot = isLayoutPatternRootNode(node);
  const Icon = isLayoutPatternRoot ? Layers : getNodeIcon(node.type);
  const nodeTypeLabel =
    isLayoutPatternRoot && layoutPatternId
      ? formatPatternLabel(layoutPatternId)
      : node.type;
  const outletRoutePath =
    node.type === 'PdxOutlet' ? outletRoutePaths[node.id] : undefined;
  const nodeLabel = outletRoutePath
    ? `${nodeTypeLabel} ${outletRoutePath} (${node.id})`
    : `${nodeTypeLabel} (${node.id})`;
  const hiddenBySplitCategory = isHiddenBySplitCategory(node);
  const nodeTypeSecondaryLabel = hiddenBySplitCategory
    ? 'Hidden by 2 Columns'
    : null;
  const isRoot = rootId && node.id === rootId;
  const isHidden = hiddenNodeIds.includes(node.id);
  const dropPlacement =
    dropHint?.overNodeId === node.id ? dropHint.placement : null;
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: node.id,
    data: { kind: 'tree-sort', nodeId: node.id, parentId },
    disabled: Boolean(isRoot),
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `tree-node:${node.id}`,
    data: { kind: 'tree-node', nodeId: node.id },
  });
  const setNodeRef = (element: HTMLDivElement | null) => {
    setDragRef(element);
    setDropRef(element);
  };
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.6 : undefined,
  };
  const selectTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      if (selectTimer.current) {
        window.clearTimeout(selectTimer.current);
        selectTimer.current = null;
      }
    };
  }, []);

  return (
    <div className="BlueprintEditorTreeNode flex flex-col gap-px">
      <div
        className="BlueprintEditorTreeRow flex items-center [&:focus-within_.BlueprintEditorTreeDragHandle]:opacity-100 [&:hover_.BlueprintEditorTreeDragHandle]:opacity-100"
        style={{ paddingLeft: depth * INDENT_PX }}
        onContextMenu={(event) => {
          if (!hasChildren) return;
          event.preventDefault();
          event.stopPropagation();
          if (typeof window !== 'undefined' && selectTimer.current) {
            window.clearTimeout(selectTimer.current);
            selectTimer.current = null;
          }
          onOpenContextMenu(node, event);
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className={`BlueprintEditorTreeToggle inline-flex h-4 w-4 flex-none items-center justify-center rounded-md border-0 bg-transparent text-(--text-muted) hover:text-(--text-primary) ${isExpanded ? 'Expanded' : ''}`}
            onClick={() => onToggle(node.id)}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
          </button>
        ) : (
          <span
            className="BlueprintEditorTreeSpacer h-4 w-4 flex-none"
            aria-hidden="true"
          />
        )}
        <button
          type="button"
          className="BlueprintEditorTreeDragHandle inline-flex h-4 w-4 flex-none cursor-grab items-center justify-center rounded-md border-0 bg-transparent text-(--text-muted) opacity-0 transition-[opacity,color] duration-150 active:cursor-grabbing disabled:cursor-default disabled:opacity-0"
          disabled={Boolean(isRoot)}
          aria-label="Drag to reorder"
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={12} />
        </button>
        <div
          ref={setNodeRef}
          role="button"
          tabIndex={0}
          className={`BlueprintEditorTreeItem relative flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-[8px] border-0 bg-transparent px-0 py-px text-left text-(--text-secondary) transition-[color,opacity,background,box-shadow] duration-150 hover:text-(--text-primary) [&.IsOver]:text-(--text-primary) [&.Selected]:text-(--text-primary) [&.Selected_.BlueprintEditorTreeCount]:text-(--text-secondary) [&.Selected_.BlueprintEditorTreeIcon]:text-(--text-primary) [&:focus-within_.BlueprintEditorTreeActions]:opacity-100 [&:hover_.BlueprintEditorTreeActions]:opacity-100 [&:hover_.BlueprintEditorTreeIcon]:text-(--text-primary) ${selectedId === node.id ? 'Selected' : ''} ${isHidden ? 'IsCanvasHidden opacity-45' : ''} ${isOver ? 'IsOver' : ''} ${dropPlacement === 'before' ? 'DropBefore' : ''} ${dropPlacement === 'after' ? 'DropAfter' : ''} ${dropPlacement === 'child' ? 'DropChild bg-(--bg-raised) shadow-[inset_0_0_0_1px_var(--border-strong)]' : ''}`.trim()}
          style={style}
          onClick={(event) => {
            if (hasChildren && !isExpanded) {
              if (typeof window !== 'undefined') {
                if (selectTimer.current) {
                  window.clearTimeout(selectTimer.current);
                }
                if (event.detail > 1) return;
                selectTimer.current = window.setTimeout(() => {
                  onSelect(node.id);
                  selectTimer.current = null;
                }, NODE_SELECT_DELAY_MS);
              }
              return;
            }
            onSelect(node.id);
          }}
          onDoubleClick={(event) => {
            if (!hasChildren) return;
            event.preventDefault();
            event.stopPropagation();
            if (typeof window !== 'undefined' && selectTimer.current) {
              window.clearTimeout(selectTimer.current);
              selectTimer.current = null;
            }
            onToggle(node.id);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(node.id);
            }
          }}
          title={nodeLabel}
          aria-label={nodeLabel}
        >
          {dropPlacement === 'before' && (
            <span
              className="pointer-events-none absolute -top-1 right-2.5 left-2.5 h-0.5 rounded-full bg-(--accent-color) shadow-[0_0_0_1px_var(--bg-canvas)]"
              aria-hidden="true"
            />
          )}
          {dropPlacement === 'after' && (
            <span
              className="pointer-events-none absolute right-2.5 -bottom-1 left-2.5 h-0.5 rounded-full bg-(--accent-color) shadow-[0_0_0_1px_var(--bg-canvas)]"
              aria-hidden="true"
            />
          )}
          <span
            className="BlueprintEditorTreeIcon inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-md bg-transparent text-(--text-muted)"
            aria-hidden="true"
          >
            <Icon size={12} />
          </span>
          <span className="BlueprintEditorTreeMeta flex min-w-0 items-center gap-1.5 select-none">
            <span className="BlueprintEditorTreeTypeRow inline-flex min-w-0 items-center gap-1.5">
              <span className="BlueprintEditorTreeType truncate text-[10px] font-medium tracking-[0.01em]">
                {nodeTypeLabel}
              </span>
              {outletRoutePath ? (
                <span className="BlueprintEditorTreeRoutePath min-w-0 truncate text-[10px] font-medium text-(--text-muted) tabular-nums">
                  {outletRoutePath}
                </span>
              ) : null}
              {nodeTypeSecondaryLabel ? (
                <span className="inline-flex items-center rounded-full border border-(--border-default) px-1 py-0 text-[8px] text-(--text-muted)">
                  {nodeTypeSecondaryLabel}
                </span>
              ) : null}
              {hasChildren && (
                <span
                  className="BlueprintEditorTreeCount inline-flex h-3.5 min-w-3.5 flex-none items-center justify-center rounded-full border border-(--border-subtle) bg-(--bg-raised) px-1 text-[9px] text-(--text-muted) tabular-nums"
                  aria-label={`${children.length} children`}
                >
                  {children.length}
                </span>
              )}
            </span>
          </span>
          <TreeNodeActions
            nodeId={node.id}
            isRoot={isRoot}
            isHidden={isHidden}
            isMenuOpen={openMenuId === node.id}
            onMenuAction={onMenuAction}
            onDelete={onDelete}
            onCopy={onCopy}
            onMove={onMove}
            onToggleHidden={onToggleHidden}
          />
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div className="BlueprintEditorTreeChildren flex flex-col gap-0.5">
          {children.map((child) => (
            <BlueprintTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedKeys={expandedKeys}
              outletRoutePaths={outletRoutePaths}
              selectedId={selectedId}
              hiddenNodeIds={hiddenNodeIds}
              dropHint={dropHint}
              rootId={rootId}
              parentId={node.id}
              openMenuId={openMenuId}
              onMenuAction={onMenuAction}
              onToggle={onToggle}
              onSelect={onSelect}
              onDelete={onDelete}
              onCopy={onCopy}
              onMove={onMove}
              onToggleHidden={onToggleHidden}
              onOpenContextMenu={onOpenContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}
