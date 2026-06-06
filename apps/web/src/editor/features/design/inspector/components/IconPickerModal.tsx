import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import type { IconRef } from '@/pir/renderer/iconRegistry';
import {
  ensureIconProviderReady,
  getIconProviderState,
  getIconRegistryRevision,
  listIconNamesByProvider,
  listIconProviders,
  resolveIconRef,
  subscribeIconRegistry,
} from '@/pir/renderer/iconRegistry';
import { useEditorShortcut } from '@/editor/shortcuts';

type IconPickerModalProps = {
  open: boolean;
  initialIconRef?: IconRef | null;
  onClose: () => void;
  onSelect: (iconRef: IconRef) => void;
};

const ICONS_PER_PAGE = 160;

const normalizeSearch = (value: string) => value.trim().toLowerCase();
const resolveHeroiconsVariant = (value: unknown): 'outline' | 'solid' =>
  value === 'solid' ? 'solid' : 'outline';
const toProviderSelectValue = (
  providerId: string,
  variant: 'outline' | 'solid'
) => (providerId === 'heroicons' ? `heroicons:${variant}` : providerId);
const parseProviderSelectValue = (
  value: string
): { providerId: string; variant: 'outline' | 'solid' } =>
  value.startsWith('heroicons:')
    ? {
        providerId: 'heroicons',
        variant: resolveHeroiconsVariant(value.split(':')[1]),
      }
    : {
        providerId: value,
        variant: 'outline',
      };

export function IconPickerModal({
  open,
  initialIconRef,
  onClose,
  onSelect,
}: IconPickerModalProps) {
  const { t } = useTranslation('blueprint');
  const registryRevision = useSyncExternalStore(
    subscribeIconRegistry,
    getIconRegistryRevision,
    getIconRegistryRevision
  );
  const providers = useMemo(() => listIconProviders(), [registryRevision]);
  const providerOptions = useMemo(() => {
    return providers.flatMap((provider) => {
      if (provider.id !== 'heroicons') {
        return [
          {
            value: provider.id,
            providerId: provider.id,
            variant: 'outline' as const,
            label: provider.label,
          },
        ];
      }
      return [
        {
          value: 'heroicons:outline',
          providerId: 'heroicons',
          variant: 'outline' as const,
          label: t('inspector.iconPicker.heroiconsOutlineLabel', {
            defaultValue: 'Heroicons: Outline',
          }),
        },
        {
          value: 'heroicons:solid',
          providerId: 'heroicons',
          variant: 'solid' as const,
          label: t('inspector.iconPicker.heroiconsSolidLabel', {
            defaultValue: 'Heroicons: Solid',
          }),
        },
      ];
    });
  }, [providers, t]);
  const fallbackProvider =
    providers.find((provider) => provider.id === 'lucide')?.id ??
    providers[0]?.id ??
    'lucide';
  const [providerId, setProviderId] = useState(
    initialIconRef?.provider ?? fallbackProvider
  );
  const [heroiconsVariant, setHeroiconsVariant] = useState<'outline' | 'solid'>(
    () => resolveHeroiconsVariant(initialIconRef?.variant)
  );
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState(initialIconRef?.name ?? '');
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const listRef = useRef<HTMLDivElement | null>(null);
  const providerSelectValue = toProviderSelectValue(
    providerId,
    heroiconsVariant
  );

  useEffect(() => {
    if (!open) return;
    setProviderId(initialIconRef?.provider ?? fallbackProvider);
    setHeroiconsVariant(resolveHeroiconsVariant(initialIconRef?.variant));
    setSelectedName(initialIconRef?.name ?? '');
    setSearch('');
    setPage(1);
    setPageInput('1');
  }, [
    fallbackProvider,
    initialIconRef?.name,
    initialIconRef?.provider,
    initialIconRef?.variant,
    open,
  ]);

  useEffect(() => {
    if (!providerOptions.length) return;
    const matchedOption = providerOptions.find(
      (option) => option.value === providerSelectValue
    );
    if (matchedOption) return;
    const fallback = providerOptions[0];
    if (!fallback) return;
    setProviderId(fallback.providerId);
    setHeroiconsVariant(fallback.variant);
  }, [providerOptions, providerSelectValue]);

  useEditorShortcut('Escape', onClose, {
    enabled: open,
    scope: 'modal',
    priority: 100,
    allowInEditable: true,
  });

  const providerState = useMemo(
    () => getIconProviderState(providerId),
    [providerId, registryRevision]
  );
  const iconNames = useMemo(
    () => listIconNamesByProvider(providerId),
    [providerId, registryRevision]
  );
  const isProviderLoading =
    providerState.status === 'loading' || providerState.status === 'idle';
  const hasProviderError = providerState.status === 'error';

  useEffect(() => {
    if (!open) return;
    void ensureIconProviderReady(providerId).catch(() => undefined);
  }, [open, providerId]);

  const filteredNames = useMemo(() => {
    const query = normalizeSearch(search);
    if (!query) return iconNames;
    return iconNames.filter((name) => name.toLowerCase().includes(query));
  }, [iconNames, search]);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredNames.length / ICONS_PER_PAGE)
  );
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * ICONS_PER_PAGE;
  const pageEnd = pageStart + ICONS_PER_PAGE;
  const visibleNames = filteredNames.slice(pageStart, pageEnd);
  const selectedRef = selectedName
    ? providerId === 'heroicons'
      ? { provider: providerId, name: selectedName, variant: heroiconsVariant }
      : { provider: providerId, name: selectedName }
    : null;
  const selectedIcon = selectedRef ? resolveIconRef(selectedRef) : null;
  const SelectedIcon = selectedIcon;
  const canApply = Boolean(selectedName);

  useEffect(() => {
    setPage(1);
  }, [providerId, search]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const applyPageInput = () => {
    const nextPage = Number(pageInput);
    if (!Number.isFinite(nextPage)) {
      setPageInput(String(currentPage));
      return;
    }
    const clamped = Math.min(totalPages, Math.max(1, Math.trunc(nextPage)));
    setPage(clamped);
    setPageInput(String(clamped));
  };

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentPage]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[3px]"
      onClick={onClose}
      data-testid="icon-picker-modal"
    >
      <div
        className="flex h-[min(78vh,760px)] w-[min(900px,96vw)] flex-col overflow-hidden rounded-[16px] border border-(--border-default) bg-(--bg-canvas) shadow-(--shadow-lg)"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-(--border-default) px-4 py-3">
          <div className="min-w-0">
            <h3 className="m-0 truncate text-[14px] font-semibold text-(--text-primary)">
              {t('inspector.iconPicker.title', {
                defaultValue: 'Select icon',
              })}
            </h3>
            <p className="m-0 mt-1 text-[11px] text-(--text-muted)">
              {t('inspector.iconPicker.subtitle', {
                defaultValue:
                  'Source + search. Ready for multiple icon providers.',
              })}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent text-(--text-muted) hover:text-(--text-primary)"
            onClick={onClose}
            data-testid="icon-picker-close"
            aria-label={t('inspector.iconPicker.close', {
              defaultValue: 'Close icon picker',
            })}
          >
            <X size={16} />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-2 border-b border-(--border-default) px-4 py-3 md:grid-cols-[180px_1fr]">
          <label className="grid gap-1 text-[11px] font-semibold text-(--text-muted)">
            {t('inspector.iconPicker.source', {
              defaultValue: 'Source',
            })}
            <select
              className="h-8 rounded-md border border-(--border-default) bg-transparent px-2 text-[12px] text-(--text-primary) outline-none"
              value={providerSelectValue}
              onChange={(event) => {
                const selection = parseProviderSelectValue(event.target.value);
                setProviderId(selection.providerId);
                setHeroiconsVariant(selection.variant);
                setSelectedName('');
                setPage(1);
              }}
              data-testid="icon-picker-provider"
            >
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[11px] font-semibold text-(--text-muted)">
            {t('inspector.iconPicker.search', {
              defaultValue: 'Search',
            })}
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-(--text-muted)"
              />
              <input
                className="h-8 w-full rounded-md border border-(--border-default) bg-transparent pr-2 pl-7 text-[12px] text-(--text-primary) outline-none placeholder:text-(--text-muted)"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('inspector.iconPicker.searchPlaceholder', {
                  defaultValue: 'Type icon name, e.g. sparkles',
                })}
                data-testid="icon-picker-search"
              />
            </div>
          </label>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-(--border-default) px-4 py-2 text-[11px] text-(--text-muted)">
              <span>
                {t('inspector.iconPicker.matched', {
                  defaultValue: '{{count}} matched',
                  count: filteredNames.length,
                })}
              </span>
              <span>
                {filteredNames.length
                  ? t('inspector.iconPicker.showingRange', {
                      defaultValue: 'showing {{from}}-{{to}} / {{total}}',
                      from: pageStart + 1,
                      to: Math.min(pageEnd, filteredNames.length),
                      total: filteredNames.length,
                    })
                  : t('inspector.iconPicker.showingEmpty', {
                      defaultValue: 'showing 0/0',
                    })}
              </span>
            </div>
            {isProviderLoading && !filteredNames.length && (
              <div className="border-b border-(--border-default) px-4 py-2 text-[11px] text-(--text-muted)">
                {t('inspector.iconPicker.loading', {
                  defaultValue: 'Loading icons from esm.sh...',
                })}
              </div>
            )}
            {hasProviderError && !filteredNames.length && (
              <div className="flex items-center justify-between gap-2 border-b border-(--border-default) px-4 py-2 text-[11px] text-(--text-muted)">
                <span className="truncate">
                  {t('inspector.iconPicker.loadError', {
                    defaultValue: 'Icon provider failed to load.',
                  })}
                </span>
                <button
                  type="button"
                  className="h-7 rounded-md border border-(--border-default) px-2 text-[11px] text-(--text-muted) hover:border-(--border-strong) hover:text-(--text-primary)"
                  onClick={() =>
                    void ensureIconProviderReady(providerId).catch(
                      () => undefined
                    )
                  }
                  data-testid="icon-picker-retry-provider"
                >
                  {t('inspector.iconPicker.retry', {
                    defaultValue: 'Retry',
                  })}
                </button>
              </div>
            )}
            <div
              ref={listRef}
              className="grid min-h-0 grid-cols-3 gap-2 overflow-y-auto p-3 md:grid-cols-4 lg:grid-cols-5"
            >
              {visibleNames.map((name) => {
                const iconRef =
                  providerId === 'heroicons'
                    ? { provider: providerId, name, variant: heroiconsVariant }
                    : { provider: providerId, name };
                const IconComponent = resolveIconRef(iconRef);
                const isActive = selectedName === name;
                return (
                  <button
                    type="button"
                    key={name}
                    className={`group flex h-[76px] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border px-1 text-center transition-colors ${isActive ? 'border-(--border-strong) bg-(--bg-raised) text-(--text-primary)' : 'border-(--border-subtle) bg-transparent text-(--text-muted) hover:border-(--border-strong) hover:text-(--text-primary)'}`}
                    onClick={() => setSelectedName(name)}
                    data-testid={`icon-picker-option-${name}`}
                    title={name}
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center">
                      {IconComponent ? (
                        <IconComponent size={18} width={18} height={18} />
                      ) : null}
                    </span>
                    <span className="w-full truncate text-[10px]">{name}</span>
                  </button>
                );
              })}
              {!visibleNames.length && (
                <div className="col-span-full rounded-md border border-dashed border-(--border-default) px-3 py-5 text-center text-[12px] text-(--text-muted)">
                  {t('inspector.iconPicker.empty', {
                    defaultValue: 'No icons found.',
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-(--border-default) px-3 py-2 text-[11px] text-(--text-muted)">
              <span>
                {t('inspector.iconPicker.page', {
                  defaultValue: 'Page {{current}}/{{total}}',
                  current: currentPage,
                  total: totalPages,
                })}
              </span>
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  className="h-7 rounded-md border border-(--border-default) px-2 text-[11px] text-(--text-muted) hover:border-(--border-strong) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage <= 1}
                  data-testid="icon-picker-prev-page"
                >
                  {t('inspector.iconPicker.prev', {
                    defaultValue: 'Prev',
                  })}
                </button>
                <button
                  type="button"
                  className="h-7 rounded-md border border-(--border-default) px-2 text-[11px] text-(--text-muted) hover:border-(--border-strong) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={currentPage >= totalPages}
                  data-testid="icon-picker-next-page"
                >
                  {t('inspector.iconPicker.next', {
                    defaultValue: 'Next',
                  })}
                </button>
                <div className="ml-1 inline-flex items-center gap-1">
                  <input
                    className="h-7 w-14 rounded-md border border-(--border-default) bg-transparent px-2 text-center text-[11px] text-(--text-secondary) outline-none"
                    value={pageInput}
                    onChange={(event) => {
                      const digitsOnly = event.target.value.replace(
                        /[^\d]/g,
                        ''
                      );
                      setPageInput(digitsOnly);
                    }}
                    onBlur={applyPageInput}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        applyPageInput();
                      }
                    }}
                    inputMode="numeric"
                    data-testid="icon-picker-jump-input"
                  />
                  <button
                    type="button"
                    className="h-7 rounded-md border border-(--border-default) px-2 text-[11px] text-(--text-muted) hover:border-(--border-strong) hover:text-(--text-primary)"
                    onClick={applyPageInput}
                    data-testid="icon-picker-jump-go"
                  >
                    {t('inspector.iconPicker.go', {
                      defaultValue: 'Go',
                    })}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <aside className="hidden w-52 border-l border-(--border-default) px-3 py-3 md:flex md:flex-col">
            <span className="text-[11px] font-semibold text-(--text-muted)">
              {t('inspector.iconPicker.preview', {
                defaultValue: 'Preview',
              })}
            </span>
            <div className="mt-3 flex flex-1 flex-col items-center justify-center rounded-md border border-(--border-default) bg-(--bg-raised)">
              {SelectedIcon ? (
                <SelectedIcon size={34} width={34} height={34} />
              ) : (
                <span className="text-[11px] text-(--text-muted)">
                  {t('inspector.iconPicker.noIcon', {
                    defaultValue: 'No icon',
                  })}
                </span>
              )}
              <span className="mt-2 max-w-[90%] truncate text-[11px] text-(--text-muted)">
                {selectedName || '--'}
              </span>
            </div>
          </aside>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-(--border-default) px-4 py-3">
          <button
            type="button"
            className="h-8 rounded-md border border-(--border-default) bg-transparent px-3 text-[12px] text-(--text-muted) hover:border-(--border-strong) hover:text-(--text-primary)"
            onClick={onClose}
          >
            {t('inspector.iconPicker.cancel', {
              defaultValue: 'Cancel',
            })}
          </button>
          <button
            type="button"
            className="h-8 rounded-md border border-(--text-primary) bg-(--text-primary) px-3 text-[12px] text-(--text-inverse) disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => {
              if (!selectedRef) return;
              onSelect(selectedRef);
              onClose();
            }}
            disabled={!canApply}
            data-testid="icon-picker-apply"
          >
            {t('inspector.iconPicker.apply', {
              defaultValue: 'Use icon',
            })}
          </button>
        </footer>
      </div>
    </div>
  );
}
