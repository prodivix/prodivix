import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PdxButton, PdxInput } from '@prodivix/ui';
import { Link2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RouteItem } from '@/editor/features/design/blueprint/editor/model/types';

type BlueprintEditorAddressBarProps = {
  currentPath: string;
  newPath: string;
  routes: RouteItem[];
  onCurrentPathChange: (value: string) => void;
  onNewPathChange: (value: string) => void;
  onAddRoute: () => void;
  statusIndicator?: ReactNode;
};

export function BlueprintEditorAddressBar({
  currentPath,
  newPath,
  routes,
  onCurrentPathChange,
  onNewPathChange,
  onAddRoute,
  statusIndicator,
}: BlueprintEditorAddressBarProps) {
  const { t } = useTranslation('blueprint');
  const [isRouteTreeOpen, setRouteTreeOpen] = useState(false);
  const routeTreeRootRef = useRef<HTMLDivElement | null>(null);
  const routeTreePanelRef = useRef<HTMLDivElement | null>(null);
  const routeTreeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [routeTreeRect, setRouteTreeRect] = useState<{
    top: number;
    left: number;
  } | null>(null);

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

  return (
    <section className="flex flex-nowrap items-center gap-3 overflow-x-auto border-b border-(--border-subtle) bg-(--bg-canvas) px-3 py-1.5">
      <div className="inline-flex items-center gap-2 whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-(--text-muted)">
          <Link2 size={14} />
          {t('address.current')}
        </span>
        <div className="w-60 max-w-60">
          <PdxInput
            placeholder={t('address.currentPlaceholder')}
            value={currentPath}
            size="Small"
            className="AddressInput AddressCurrentInput"
            onChange={onCurrentPathChange}
          />
        </div>
      </div>
      <div className="inline-flex items-center gap-2 whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-(--text-muted)">
          <Plus size={14} />
          {t('address.new')}
        </span>
        <div className="w-50">
          <PdxInput
            placeholder={t('address.newPlaceholder')}
            value={newPath}
            size="Small"
            className="AddressInput AddressNewInput"
            onChange={onNewPathChange}
          />
        </div>
        <PdxButton
          text={t('address.add')}
          size="Tiny"
          category="Ghost"
          onClick={onAddRoute}
        />
      </div>
      <div className="ml-auto flex min-w-[260px] items-center gap-2">
        <span className="shrink-0 text-[11px] text-(--text-muted)">
          {t('address.list', { defaultValue: 'Routes' })}
        </span>
        <div className="relative min-w-0 flex-1" ref={routeTreeRootRef}>
          <button
            ref={routeTreeTriggerRef}
            type="button"
            data-testid="address-route-menu-trigger"
            className="h-7 w-full truncate rounded-full border border-(--border-default) bg-transparent px-3 text-left text-[11px] text-(--text-secondary) hover:bg-(--bg-raised) hover:text-(--text-primary)"
            onClick={() => setRouteTreeOpen((prev) => !prev)}
          >
            {currentPath}
          </button>
        </div>
        {isRouteTreeOpen && routeTreeRect && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={routeTreePanelRef}
                className="fixed z-[80] flex max-h-52 max-w-[420px] min-w-[320px] flex-col gap-1 overflow-y-auto rounded-lg border border-(--border-default) bg-(--bg-canvas) p-1 shadow-(--shadow-lg)"
                style={{
                  top: `${routeTreeRect.top}px`,
                  left: `${Math.max(12, routeTreeRect.left)}px`,
                  transform: 'translateX(-100%)',
                }}
              >
                {routes.map((route) => {
                  const depth = Math.max(0, route.depth ?? 0);
                  const isActive = route.path === currentPath;
                  const label = route.label?.trim() || route.path;
                  return (
                    <button
                      key={route.id}
                      type="button"
                      data-testid={`address-route-item-${route.id}`}
                      className={`flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-left text-[11px] ${
                        isActive
                          ? 'bg-(--bg-raised) text-(--text-primary)'
                          : 'text-(--text-secondary) hover:bg-(--bg-raised) hover:text-(--text-primary)'
                      }`}
                      style={{ paddingLeft: `${8 + depth * 12}px` }}
                      onClick={() => {
                        onCurrentPathChange(route.path);
                        setRouteTreeOpen(false);
                      }}
                    >
                      <span className="truncate">{label}</span>
                      <span className="truncate text-(--text-muted)">
                        {route.path}
                      </span>
                    </button>
                  );
                })}
              </div>,
              document.body
            )
          : null}
        {statusIndicator ? (
          <div className="inline-flex shrink-0 items-center">
            {statusIndicator}
          </div>
        ) : null}
      </div>
    </section>
  );
}
