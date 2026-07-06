import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import type {
  TreeContextMenuAction,
  TreeContextMenuAvailability,
  TreeContextMenuState,
} from './componentTreeTypes';

type TreeContextMenuProps = {
  menu: TreeContextMenuState;
  availability: TreeContextMenuAvailability;
  onAction: (action: TreeContextMenuAction) => void;
};

export function TreeContextMenu({
  menu,
  availability,
  onAction,
}: TreeContextMenuProps) {
  return (
    <div
      className="BlueprintEditorTreeContextMenu fixed z-50 flex w-[168px] flex-col gap-0.5 rounded-[8px] bg-(--bg-canvas) p-1 shadow-(--shadow-md) ring-1 ring-(--border-subtle)"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      aria-label="Component tree context menu"
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {availability.canExpand ? (
        <button
          type="button"
          className="BlueprintEditorTreeContextMenuItem inline-flex items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1 text-left text-[11px] text-(--text-secondary) hover:bg-(--bg-raised) hover:text-(--text-primary)"
          role="menuitem"
          onClick={() => onAction('expand')}
        >
          <ChevronRight size={13} />
          <span>Expand</span>
        </button>
      ) : null}
      {availability.canExpandRecursive ? (
        <button
          type="button"
          className="BlueprintEditorTreeContextMenuItem inline-flex items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1 text-left text-[11px] text-(--text-secondary) hover:bg-(--bg-raised) hover:text-(--text-primary)"
          role="menuitem"
          onClick={() => onAction('expandRecursive')}
        >
          <Layers size={13} />
          <span>Expand recursively</span>
        </button>
      ) : null}
      {availability.canCollapse ? (
        <button
          type="button"
          className="BlueprintEditorTreeContextMenuItem inline-flex items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1 text-left text-[11px] text-(--text-secondary) hover:bg-(--bg-raised) hover:text-(--text-primary)"
          role="menuitem"
          onClick={() => onAction('collapse')}
        >
          <ChevronDown size={13} />
          <span>Collapse</span>
        </button>
      ) : null}
      {availability.canCollapseRecursive ? (
        <button
          type="button"
          className="BlueprintEditorTreeContextMenuItem inline-flex items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1 text-left text-[11px] text-(--text-secondary) hover:bg-(--bg-raised) hover:text-(--text-primary)"
          role="menuitem"
          onClick={() => onAction('collapseRecursive')}
        >
          <Layers size={13} />
          <span>Collapse recursively</span>
        </button>
      ) : null}
    </div>
  );
}
