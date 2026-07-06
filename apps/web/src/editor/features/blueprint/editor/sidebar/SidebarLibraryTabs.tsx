import type { LibraryTab } from './sidebarTypes';

type SidebarLibraryTabsProps = {
  tabs: LibraryTab[];
  activeLibraryId: string;
  onActiveLibraryChange: (libraryId: string) => void;
};

export function SidebarLibraryTabs({
  tabs,
  activeLibraryId,
  onActiveLibraryChange,
}: SidebarLibraryTabsProps) {
  return (
    <div className="BlueprintEditorSidebarLibraryBar px-3 py-2">
      <div className="flex w-full flex-wrap items-center gap-1 text-[11px] text-(--text-muted)">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`h-6 cursor-pointer rounded-full px-2 transition-colors ${
              activeLibraryId === tab.id
                ? 'border border-(--border-strong) text-(--text-primary)'
                : 'border border-transparent bg-transparent hover:text-(--text-primary)'
            }`}
            onClick={() => onActiveLibraryChange(tab.id)}
            aria-label={tab.label}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
