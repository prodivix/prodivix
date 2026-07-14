import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import type { PIRRenderLocation } from '@prodivix/pir-react-renderer';

type TreeNodeActionsProps = {
  location: PIRRenderLocation;
  isRoot?: boolean | '';
  isHidden: boolean;
  isMenuOpen: boolean;
  onMenuAction?: (location: PIRRenderLocation) => void;
  onDelete: (location: PIRRenderLocation) => void;
  onCopy: (location: PIRRenderLocation) => void;
  onMove: (location: PIRRenderLocation, direction: 'up' | 'down') => void;
  onToggleHidden: (location: PIRRenderLocation) => void;
};

export function TreeNodeActions({
  location,
  isRoot,
  isHidden,
  isMenuOpen,
  onMenuAction,
  onDelete,
  onCopy,
  onMove,
  onToggleHidden,
}: TreeNodeActionsProps) {
  const VisibilityIcon = isHidden ? EyeOff : Eye;

  return (
    <span className="BlueprintEditorTreeActions ml-auto inline-flex items-center opacity-0 transition-opacity duration-150">
      <button
        type="button"
        className="BlueprintEditorTreeNodeAction inline-flex items-center gap-1 rounded-full border-0 bg-transparent px-0.5 py-0 text-[10px] text-(--text-muted) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-45"
        onClick={(event) => {
          event.stopPropagation();
          onToggleHidden(location);
        }}
        disabled={Boolean(isRoot)}
        aria-label={isHidden ? 'Show layer on canvas' : 'Hide layer on canvas'}
        title={isHidden ? 'Show layer on canvas' : 'Hide layer on canvas'}
      >
        <VisibilityIcon size={12} />
      </button>
      <button
        type="button"
        className="BlueprintEditorTreeNodeAction Danger inline-flex items-center gap-1 rounded-full border-0 bg-transparent px-0.5 py-0 text-[10px] text-(--danger-color) hover:text-(--danger-hover) disabled:cursor-not-allowed disabled:opacity-45"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(location);
        }}
        disabled={Boolean(isRoot)}
        aria-label="Delete"
        title="Delete"
      >
        <Trash2 size={12} />
      </button>
      <span
        className={`BlueprintEditorTreeMenu relative inline-flex items-center [&.IsOpen_.BlueprintEditorTreeMenuList]:pointer-events-auto [&.IsOpen_.BlueprintEditorTreeMenuList]:visible [&.IsOpen_.BlueprintEditorTreeMenuList]:opacity-100 [&.IsOpen_.BlueprintEditorTreeMenuList]:delay-0 [&:focus-within_.BlueprintEditorTreeMenuList]:pointer-events-auto [&:focus-within_.BlueprintEditorTreeMenuList]:visible [&:focus-within_.BlueprintEditorTreeMenuList]:opacity-100 [&:focus-within_.BlueprintEditorTreeMenuList]:delay-0 [&:hover_.BlueprintEditorTreeMenuList]:pointer-events-auto [&:hover_.BlueprintEditorTreeMenuList]:visible [&:hover_.BlueprintEditorTreeMenuList]:opacity-100 [&:hover_.BlueprintEditorTreeMenuList]:delay-0 ${isMenuOpen ? 'IsOpen' : ''}`}
      >
        <button
          type="button"
          className="BlueprintEditorTreeNodeAction inline-flex items-center gap-1 rounded-full border-0 bg-transparent px-0.5 py-0 text-[10px] text-(--text-muted) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-45"
          onClick={(event) => {
            event.stopPropagation();
            onMenuAction?.(location);
          }}
          aria-label="More actions"
          title="More actions"
        >
          <MoreHorizontal size={12} />
        </button>
        <span
          className="BlueprintEditorTreeMenuList pointer-events-none invisible absolute top-1/2 left-0 z-[5] inline-flex -translate-x-full -translate-y-1/2 gap-1 rounded-[10px] bg-(--bg-canvas) p-1.5 opacity-0 shadow-(--shadow-md) ring-1 ring-(--border-subtle) transition-[opacity,visibility] delay-[500ms] duration-150"
          role="menu"
        >
          <button
            type="button"
            className="BlueprintEditorTreeMenuItem inline-flex items-center justify-center rounded-lg border-0 bg-transparent px-1 py-0.5 text-(--text-muted) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-45"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              onMenuAction?.(location);
              onMove(location, 'up');
            }}
            disabled={Boolean(isRoot)}
            aria-label="Move up"
            title="Move up"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className="BlueprintEditorTreeMenuItem inline-flex items-center justify-center rounded-lg border-0 bg-transparent px-1 py-0.5 text-(--text-muted) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-45"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              onMenuAction?.(location);
              onMove(location, 'down');
            }}
            disabled={Boolean(isRoot)}
            aria-label="Move down"
            title="Move down"
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            className="BlueprintEditorTreeMenuItem inline-flex items-center justify-center rounded-lg border-0 bg-transparent px-1 py-0.5 text-(--text-muted) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-45"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              onMenuAction?.(location);
              onCopy(location);
            }}
            disabled={Boolean(isRoot)}
            aria-label="Copy"
            title="Copy"
          >
            <Copy size={14} />
          </button>
        </span>
      </span>
    </span>
  );
}
