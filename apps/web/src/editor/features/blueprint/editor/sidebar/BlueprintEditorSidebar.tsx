import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getComponentGroups } from '@/editor/features/blueprint/registry';
import { SidebarComponentList } from './SidebarComponentList';
import { SidebarExternalState } from './SidebarExternalState';
import { SidebarHeader } from './SidebarHeader';
import { SidebarLibraryTabs } from './SidebarLibraryTabs';
import type { BlueprintEditorSidebarProps, LibraryTab } from './sidebarTypes';

export function BlueprintEditorSidebar({
  isCollapsed,
  isTreeCollapsed = false,
  collapsedGroups,
  expandedPreviews,
  sizeSelections,
  statusSelections,
  externalDiagnostics = [],
  externalLibraryStates = [],
  externalLibraryOptions = [],
  isExternalLibraryLoading,
  onReloadExternalLibraries,
  onRetryExternalLibrary,
  onToggleCollapse,
  onToggleGroup,
  onTogglePreview,
  onPreviewKeyDown,
  onAddComponent,
  onSizeSelect,
  onStatusSelect,
  onStatusCycleStart,
  onStatusCycleStop,
}: BlueprintEditorSidebarProps) {
  const { t } = useTranslation('blueprint');
  const [query, setQuery] = useState('');
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [activeLibraryId, setActiveLibraryId] = useState('builtIn');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const libraryTabs = useMemo<LibraryTab[]>(
    () => [
      {
        id: 'builtIn',
        label: t('sidebar.libraries.builtIn'),
        source: 'builtIn' as const,
      },
      {
        id: 'headless',
        label: t('sidebar.libraries.headless'),
        source: 'headless' as const,
      },
      ...externalLibraryOptions.map((item) => ({
        id: `external:${item.id}`,
        label: item.label,
        source: 'external' as const,
        libraryId: item.id,
      })),
    ],
    [externalLibraryOptions, t]
  );
  const activeLibraryTab =
    libraryTabs.find((tab) => tab.id === activeLibraryId) ?? libraryTabs[0];
  const normalizedQuery = query.trim().toLowerCase();
  const effectiveSearchOpen = isSearchOpen || Boolean(normalizedQuery);

  useEffect(() => {
    if (libraryTabs.some((tab) => tab.id === activeLibraryId)) return;
    setActiveLibraryId(libraryTabs[0]?.id ?? 'builtIn');
  }, [activeLibraryId, libraryTabs]);

  const groups = useMemo(() => {
    const rawGroups = getComponentGroups();
    const scopedGroups = rawGroups.filter((group) => {
      const groupSource = group.source ?? 'builtIn';
      if (activeLibraryTab?.source === 'external') {
        if (groupSource !== 'external') return false;
        if (!activeLibraryTab.libraryId) return true;
        return group.items.some(
          (item) => item.libraryId === activeLibraryTab.libraryId
        );
      }
      return groupSource === activeLibraryTab?.source;
    });

    if (!normalizedQuery) return scopedGroups;

    return scopedGroups
      .map((group) => {
        const groupTitle = t(`componentLibrary.groups.${group.id}.title`, {
          defaultValue: group.title,
        });
        const groupMatches =
          group.id.toLowerCase().includes(normalizedQuery) ||
          groupTitle.toLowerCase().includes(normalizedQuery);

        const nextItems = groupMatches
          ? group.items
          : group.items.filter((item) => {
              if (
                activeLibraryTab?.source === 'external' &&
                activeLibraryTab.libraryId &&
                item.libraryId !== activeLibraryTab.libraryId
              ) {
                return false;
              }
              const itemName = t(`componentLibrary.items.${item.id}.name`, {
                defaultValue: item.name,
              });
              return (
                item.id.toLowerCase().includes(normalizedQuery) ||
                itemName.toLowerCase().includes(normalizedQuery)
              );
            });

        if (nextItems.length === 0) return null;
        return { ...group, items: nextItems };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
  }, [activeLibraryTab, normalizedQuery, t]);

  const hasExternalItems = useMemo(
    () =>
      groups.some(
        (group) =>
          (group.source ?? 'builtIn') === 'external' && group.items.length > 0
      ),
    [groups]
  );
  const failedExternalLibraries = useMemo(
    () =>
      externalLibraryStates.filter((state) => {
        if (
          activeLibraryTab?.source === 'external' &&
          activeLibraryTab.libraryId &&
          state.libraryId !== activeLibraryTab.libraryId
        ) {
          return false;
        }
        return state.status === 'error';
      }),
    [activeLibraryTab, externalLibraryStates]
  );
  const scopedExternalDiagnostics = useMemo(() => {
    if (activeLibraryTab?.source !== 'external') return [];
    if (!activeLibraryTab.libraryId) return externalDiagnostics;
    return externalDiagnostics.filter(
      (item) => !item.libraryId || item.libraryId === activeLibraryTab.libraryId
    );
  }, [activeLibraryTab, externalDiagnostics]);

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };
  const clearQuery = () => setQuery('');
  const openSearch = () => setSearchOpen(true);
  const closeSearch = () => setSearchOpen(false);
  const translate = (key: string, options?: Record<string, unknown>) =>
    t(key, options);

  useEffect(() => {
    if (!effectiveSearchOpen) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [effectiveSearchOpen]);

  return (
    <aside
      className={`BlueprintEditorSidebar absolute flex min-h-0 w-[var(--sidebar-width)] flex-col rounded-[14px] border border-(--border-subtle) bg-(--bg-canvas) shadow-(--shadow-md) ${isCollapsed ? 'Collapsed top-3 left-0 z-[7] h-0 w-0 overflow-visible border-none bg-transparent p-0 shadow-none' : `top-0 left-0 z-[4] ${!isTreeCollapsed ? '[bottom:var(--component-tree-height)] rounded-b-none border-b-0' : 'bottom-0'}`}`}
    >
      <SidebarHeader
        title={t('sidebar.title')}
        isCollapsed={isCollapsed}
        isSearchOpen={effectiveSearchOpen}
        query={query}
        searchInputRef={searchInputRef}
        searchPlaceholder={t('sidebar.searchPlaceholder')}
        openSearchLabel={t('sidebar.openSearch')}
        clearSearchLabel={t('sidebar.clearSearch')}
        collapseLabel={t('sidebar.collapse')}
        expandLabel={t('sidebar.expand')}
        onQueryChange={handleQueryChange}
        onQueryClear={clearQuery}
        onSearchOpen={openSearch}
        onSearchClose={closeSearch}
        onToggleCollapse={onToggleCollapse}
      />
      {!isCollapsed && (
        <SidebarLibraryTabs
          tabs={libraryTabs}
          activeLibraryId={activeLibraryId}
          onActiveLibraryChange={setActiveLibraryId}
        />
      )}
      {!isCollapsed && activeLibraryTab?.source === 'external' && (
        <SidebarExternalState
          diagnostics={scopedExternalDiagnostics}
          failedLibraries={failedExternalLibraries}
          hasExternalItems={hasExternalItems}
          isLoading={isExternalLibraryLoading}
          onReloadExternalLibraries={onReloadExternalLibraries}
          onRetryExternalLibrary={onRetryExternalLibrary}
        />
      )}
      {!isCollapsed && (
        <SidebarComponentList
          groups={groups}
          collapsedGroups={collapsedGroups}
          expandedPreviews={expandedPreviews}
          sizeSelections={sizeSelections}
          statusSelections={statusSelections}
          translate={translate}
          onToggleGroup={onToggleGroup}
          onTogglePreview={onTogglePreview}
          onPreviewKeyDown={onPreviewKeyDown}
          onAddComponent={onAddComponent}
          onSizeSelect={onSizeSelect}
          onStatusSelect={onStatusSelect}
          onStatusCycleStart={onStatusCycleStart}
          onStatusCycleStop={onStatusCycleStop}
        />
      )}
    </aside>
  );
}
