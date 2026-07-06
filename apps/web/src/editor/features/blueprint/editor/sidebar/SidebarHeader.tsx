import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import { ChevronLeft, PanelLeft, Search, X } from 'lucide-react';
import {
  headerCollapseButtonClassName,
  leftCollapsedButtonClassName,
} from '../collapseButtonStyles';

type SidebarHeaderProps = {
  title: string;
  isCollapsed: boolean;
  isSearchOpen: boolean;
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchPlaceholder: string;
  openSearchLabel: string;
  clearSearchLabel: string;
  collapseLabel: string;
  expandLabel: string;
  onQueryChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onQueryClear: () => void;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  onToggleCollapse: () => void;
};

export function SidebarHeader({
  title,
  isCollapsed,
  isSearchOpen,
  query,
  searchInputRef,
  searchPlaceholder,
  openSearchLabel,
  clearSearchLabel,
  collapseLabel,
  expandLabel,
  onQueryChange,
  onQueryClear,
  onSearchOpen,
  onSearchClose,
  onToggleCollapse,
}: SidebarHeaderProps) {
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onQueryClear();
    onSearchClose();
  };
  const toggleLabel = isCollapsed ? expandLabel : collapseLabel;

  return (
    <div
      className={`BlueprintEditorSidebarHeader flex items-center justify-between gap-2.5 border-b border-(--border-subtle) px-3 py-2.5 text-[13px] font-medium text-(--text-primary) ${isCollapsed ? 'w-full items-center justify-center border-b-0 p-0' : ''}`}
    >
      <span
        className={`BlueprintEditorSidebarTitle min-w-0 ${isCollapsed ? 'hidden' : ''}`}
      >
        {title}
      </span>
      <div className="BlueprintEditorSidebarHeaderRight inline-flex min-w-0 items-center justify-end gap-2">
        {!isCollapsed && (
          <div
            className={`BlueprintEditorSidebarSearch inline-flex h-7 items-center gap-1.5 overflow-hidden rounded-full border border-transparent bg-transparent px-1 transition-[width,border-color,background] duration-150 ${isSearchOpen ? 'IsOpen w-[220px] border-(--border-subtle) bg-(--bg-raised) backdrop-blur-[6px]' : 'w-[30px]'}`.trim()}
            role="search"
            onKeyDown={handleSearchKeyDown}
          >
            <button
              type="button"
              className="BlueprintEditorSidebarSearchToggle inline-flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent p-0 text-(--text-muted) hover:bg-(--bg-raised) hover:text-(--text-primary)"
              onClick={() => {
                if (isSearchOpen) return;
                onSearchOpen();
              }}
              aria-label={openSearchLabel}
            >
              <Search size={14} />
            </button>
            <input
              ref={searchInputRef}
              className={`BlueprintEditorSidebarSearchInput min-w-0 flex-1 border-0 bg-transparent text-xs text-(--text-primary) transition-opacity outline-none placeholder:text-(--text-muted) ${isSearchOpen ? 'pointer-events-auto w-auto opacity-100' : 'pointer-events-none w-0 opacity-0'}`}
              value={query}
              placeholder={searchPlaceholder}
              onChange={onQueryChange}
              onBlur={() => {
                if (query.trim()) return;
                onSearchClose();
              }}
              aria-label={searchPlaceholder}
            />
            <button
              type="button"
              className={`BlueprintEditorSidebarSearchClear inline-flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent p-0 text-(--text-muted) transition-opacity hover:bg-(--bg-raised) hover:text-(--text-primary) disabled:cursor-default disabled:bg-transparent disabled:opacity-30 ${isSearchOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
              onClick={() => {
                onQueryClear();
                searchInputRef.current?.focus();
              }}
              aria-label={clearSearchLabel}
              disabled={!query}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <button
          className={`BlueprintEditorCollapse ${isCollapsed ? `absolute top-0 left-0 ${leftCollapsedButtonClassName}` : headerCollapseButtonClassName}`}
          onClick={onToggleCollapse}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          {isCollapsed ? <PanelLeft size={15} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </div>
  );
}
