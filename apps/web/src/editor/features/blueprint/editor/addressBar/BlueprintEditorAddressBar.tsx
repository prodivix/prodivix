import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { PdxButton, PdxInput } from '@prodivix/ui';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FilePlus2,
  FolderTree,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RouteItem } from '@/editor/features/blueprint/editor/model/types';

type BlueprintEditorAddressBarProps = {
  currentPath: string;
  newPath: string;
  routes: RouteItem[];
  matchedRouteNodeId?: string;
  onCurrentPathChange: (value: string) => void;
  onNewPathChange: (value: string) => void;
  onAddRoute: () => void;
  onAddRouteAtPath: (path: string) => void;
  onAddChildRoute: (routeNodeId: string) => void;
  onCreateIndexRoute: (routeNodeId: string) => void;
  onRenameRoute: (routeNodeId: string, currentLabel: string) => void;
  onMoveRoute: (routeNodeId: string, direction: 'up' | 'down') => void;
  onDeleteRoute: (routeNodeId: string) => void;
  statusIndicator?: ReactNode;
};

export function BlueprintEditorAddressBar({
  currentPath,
  newPath,
  routes,
  matchedRouteNodeId,
  onCurrentPathChange,
  onNewPathChange,
  onAddRoute,
  onAddRouteAtPath,
  onAddChildRoute,
  onCreateIndexRoute,
  onRenameRoute,
  onMoveRoute,
  onDeleteRoute,
  statusIndicator,
}: BlueprintEditorAddressBarProps) {
  const { t } = useTranslation('blueprint');
  const [isRouteTreeOpen, setRouteTreeOpen] = useState(false);
  const [routeSearch, setRouteSearch] = useState('');
  const routeTreeRootRef = useRef<HTMLDivElement | null>(null);
  const routeTreePanelRef = useRef<HTMLDivElement | null>(null);
  const routeTreeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [routeTreeRect, setRouteTreeRect] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const matchedRoute = useMemo(
    () =>
      matchedRouteNodeId
        ? (routes.find((route) => route.id === matchedRouteNodeId) ?? null)
        : null,
    [matchedRouteNodeId, routes]
  );
  const normalizedSearch = routeSearch.trim().toLowerCase();
  const visibleRoutes = useMemo(() => {
    if (!normalizedSearch) return routes;
    return routes.filter((route) => {
      const label = route.label?.trim() || route.path;
      return (
        route.path.toLowerCase().includes(normalizedSearch) ||
        label.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [normalizedSearch, routes]);
  const isCurrentPathUnmatched =
    Boolean(currentPath.trim()) && !matchedRouteNodeId;

  useEffect(() => {
    if (!isRouteTreeOpen) return;
    const updateRect = () => {
      const trigger = routeTreeTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setRouteTreeRect({
        top: rect.bottom + 8,
        left: rect.right,
      });
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (routeTreeRootRef.current?.contains(target)) return;
      if (routeTreePanelRef.current?.contains(target)) return;
      setRouteTreeOpen(false);
    };

    updateRect();
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [isRouteTreeOpen]);

  const handleSelectRoute = (route: RouteItem) => {
    onCurrentPathChange(route.path);
    setRouteTreeOpen(false);
  };

  const handleAddRouteFromPanel = () => {
    onAddRoute();
    setRouteTreeOpen(false);
  };

  const handleCreateCurrentPath = () => {
    onAddRouteAtPath(currentPath);
    setRouteTreeOpen(false);
  };

  const handleRouteKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    route: RouteItem
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleSelectRoute(route);
  };

  const renderRouteTree = () => (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {visibleRoutes.length ? (
        visibleRoutes.map((route) => {
          const depth = Math.max(0, route.depth ?? 0);
          const isActive = route.id === matchedRouteNodeId;
          const label = route.label?.trim() || route.path;
          const canRename = route.index !== true;
          const subtitle = route.index
            ? t('address.routeTree.indexLabel', {
                defaultValue: 'Index route',
              })
            : label !== route.path
              ? label
              : '';
          return (
            <div
              key={route.id}
              role="button"
              tabIndex={0}
              data-testid={`address-route-item-${route.id}`}
              className={`group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md px-2 py-1.5 text-[11px] outline-none ${
                isActive
                  ? 'bg-(--bg-raised) text-(--text-primary)'
                  : 'text-(--text-secondary) hover:bg-(--bg-raised) hover:text-(--text-primary) focus:bg-(--bg-raised) focus:text-(--text-primary)'
              }`}
              onClick={() => handleSelectRoute(route)}
              onKeyDown={(event) => handleRouteKeyDown(event, route)}
            >
              <div
                className="min-w-0"
                style={{ paddingLeft: `${4 + depth * 12}px` }}
              >
                <span className="block truncate text-[12px] font-medium">
                  {route.path}
                </span>
                {subtitle ? (
                  <span className="block truncate text-[10px] text-(--text-muted)">
                    {subtitle}
                  </span>
                ) : null}
              </div>
              <div className="pointer-events-none flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
                <button
                  type="button"
                  title={t('address.routeTree.addChild', {
                    defaultValue: 'Add child route',
                  })}
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent hover:border-(--border-default) hover:bg-(--bg-canvas)"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddChildRoute(route.id);
                  }}
                >
                  <Plus size={13} />
                </button>
                <button
                  type="button"
                  title={t('address.routeTree.addIndex', {
                    defaultValue: 'Add index route',
                  })}
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent hover:border-(--border-default) hover:bg-(--bg-canvas)"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCreateIndexRoute(route.id);
                  }}
                >
                  <FilePlus2 size={13} />
                </button>
                <button
                  type="button"
                  title={t('address.routeTree.rename', {
                    defaultValue: 'Rename route',
                  })}
                  disabled={!canRename}
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent hover:border-(--border-default) hover:bg-(--bg-canvas) disabled:cursor-not-allowed disabled:opacity-30"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRenameRoute(route.id, label);
                  }}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  title={t('address.routeTree.moveUp', {
                    defaultValue: 'Move up',
                  })}
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent hover:border-(--border-default) hover:bg-(--bg-canvas)"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMoveRoute(route.id, 'up');
                  }}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  title={t('address.routeTree.moveDown', {
                    defaultValue: 'Move down',
                  })}
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent hover:border-(--border-default) hover:bg-(--bg-canvas)"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMoveRoute(route.id, 'down');
                  }}
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  title={t('address.routeTree.delete', {
                    defaultValue: 'Delete route',
                  })}
                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-transparent text-(--danger-color) hover:border-(--border-default) hover:bg-(--bg-canvas)"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteRoute(route.id);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })
      ) : (
        <div className="px-2 py-5 text-center text-[11px] text-(--text-muted)">
          {t('address.routeTree.emptySearch', {
            defaultValue: 'No route matches this search.',
          })}
        </div>
      )}
    </div>
  );

  return (
    <section className="flex flex-nowrap items-center gap-3 overflow-x-auto border-b border-(--border-subtle) bg-(--bg-canvas) px-3 py-1.5">
      <div className="inline-flex min-w-[360px] flex-1 items-center gap-2 whitespace-nowrap">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-(--text-muted)">
          <Link2 size={14} />
          {t('address.current')}
        </span>
        <div className="max-w-[560px] min-w-[240px] flex-1">
          <PdxInput
            placeholder={t('address.currentPlaceholder')}
            value={currentPath}
            size="Small"
            className="AddressInput AddressCurrentInput"
            onChange={onCurrentPathChange}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && isCurrentPathUnmatched) {
                handleCreateCurrentPath();
              }
            }}
          />
        </div>
        {isCurrentPathUnmatched ? (
          <button
            type="button"
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-(--warning-color) px-2 text-[11px] text-(--warning-color) hover:bg-(--bg-raised)"
            onClick={() => setRouteTreeOpen(true)}
          >
            <Plus size={13} />
            {t('address.routeTree.unmatched', {
              defaultValue: 'Create route',
            })}
          </button>
        ) : null}
      </div>

      <div className="ml-auto flex min-w-[220px] items-center gap-2">
        <div className="relative min-w-0 flex-1" ref={routeTreeRootRef}>
          <button
            ref={routeTreeTriggerRef}
            type="button"
            data-testid="address-route-menu-trigger"
            className="grid h-7 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-full border border-(--border-default) bg-transparent px-3 text-left text-[11px] text-(--text-secondary) hover:bg-(--bg-raised) hover:text-(--text-primary)"
            onClick={() => setRouteTreeOpen((prev) => !prev)}
          >
            <FolderTree size={13} />
            <span className="truncate">
              {matchedRoute?.path ??
                t('address.list', { defaultValue: 'Routes' })}
            </span>
            <ChevronDown size={13} />
          </button>
        </div>
        {statusIndicator ? (
          <div className="inline-flex shrink-0 items-center">
            {statusIndicator}
          </div>
        ) : null}
      </div>

      {isRouteTreeOpen && routeTreeRect && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={routeTreePanelRef}
              className="fixed z-[80] flex max-h-[440px] w-[420px] max-w-[calc(100vw-24px)] flex-col gap-2 rounded-lg border border-(--border-default) bg-(--bg-canvas) p-2 shadow-(--shadow-lg)"
              style={{
                top: `${routeTreeRect.top}px`,
                left: `${Math.max(12, routeTreeRect.left)}px`,
                transform: 'translateX(-100%)',
              }}
            >
              {isCurrentPathUnmatched ? (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-(--warning-color) bg-(--bg-raised) px-2 py-1.5">
                  <div className="min-w-0 truncate text-[11px] text-(--text-secondary)">
                    {t('address.routeTree.unmatchedPath', {
                      path: currentPath,
                      defaultValue: 'No route matches {{path}}',
                    })}
                  </div>
                  <PdxButton
                    text={t('address.routeTree.createCurrent', {
                      defaultValue: 'Create route',
                    })}
                    size="Tiny"
                    category="Primary"
                    onClick={handleCreateCurrentPath}
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <PdxInput
                  placeholder={t('address.newPlaceholder')}
                  value={newPath}
                  size="Small"
                  className="AddressInput AddressNewInput"
                  onChange={onNewPathChange}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleAddRouteFromPanel();
                  }}
                />
                <PdxButton
                  text={t('address.add')}
                  size="Tiny"
                  category="Ghost"
                  onClick={handleAddRouteFromPanel}
                />
              </div>

              <PdxInput
                type="Search"
                placeholder={t('address.routeTree.search', {
                  defaultValue: 'Search routes',
                })}
                value={routeSearch}
                size="Small"
                icon={<Search size={13} />}
                className="AddressInput AddressRouteSearchInput"
                onChange={setRouteSearch}
              />

              {renderRouteTree()}
            </div>,
            document.body
          )
        : null}
    </section>
  );
}
