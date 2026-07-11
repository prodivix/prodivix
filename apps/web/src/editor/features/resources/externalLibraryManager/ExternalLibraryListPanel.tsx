import type { ActiveLibrary, PackageSizeThresholds } from './types';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatPackageSize, getPackageSizeMeta } from './viewUtils';

type ExternalLibraryListPanelProps = {
  activeLibraries: ActiveLibrary[];
  filteredLibraries: ActiveLibrary[];
  selectedLibraryId: string | null;
  searchInput: string;
  debouncedSearchInput: string;
  packageSizeThresholds: PackageSizeThresholds;
  onSelectLibrary: (libraryId: string) => void;
  onOpenAddModal: () => void;
  onRemoveLibrary: (libraryId: string) => void;
  onVersionChange: (libraryId: string, version: string) => void;
};

export function ExternalLibraryListPanel({
  activeLibraries,
  filteredLibraries,
  selectedLibraryId,
  searchInput,
  debouncedSearchInput,
  packageSizeThresholds,
  onSelectLibrary,
  onOpenAddModal,
  onRemoveLibrary,
  onVersionChange,
}: ExternalLibraryListPanelProps) {
  const { t } = useTranslation('editor');

  const resolvePackageLevelLabel = (level: string) =>
    t(`resourceManager.external.package.level.${level}`);

  const resolvePackageHint = (level: string) =>
    t(`resourceManager.external.package.hint.${level}`);

  return (
    <section className="grid gap-3 rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-(--text-primary)">
            {t('resourceManager.external.activeLibraries')}
          </h3>
          <p className="mt-1 text-xs text-(--text-secondary)">
            {t('resourceManager.external.libraryCount', {
              count: activeLibraries.length,
            })}{' '}
            ·{' '}
            {searchInput.trim().toLowerCase() !== debouncedSearchInput
              ? t('resourceManager.external.debouncing')
              : t('resourceManager.external.searchReady')}
          </p>
        </div>
        <button
          type="button"
          data-testid="external-library-open-add-modal"
          aria-label={t('resourceManager.external.actions.addNewLibrary')}
          title={t('resourceManager.external.actions.addNewLibrary')}
          className="inline-flex size-8 items-center justify-center rounded-lg border border-(--border-default) bg-(--bg-canvas) text-(--text-secondary) hover:border-(--border-strong) hover:text-(--text-primary)"
          onClick={onOpenAddModal}
        >
          <Plus size={16} />
        </button>
      </div>

      {filteredLibraries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-(--border-default) bg-(--bg-canvas) p-4 text-sm text-(--text-secondary)">
          {t('resourceManager.external.noMatch')}
        </div>
      ) : (
        <div className="grid gap-2">
          {filteredLibraries.map((library) => {
            const packageSizeMeta = getPackageSizeMeta(
              library.packageSizeKb,
              packageSizeThresholds
            );
            const isSelected = library.id === selectedLibraryId;
            return (
              <section
                key={library.id}
                data-testid={`external-library-card-${library.id}`}
                className={`grid gap-2 rounded-xl border p-3 ${
                  isSelected
                    ? 'border-(--border-strong) bg-(--bg-canvas)'
                    : 'border-(--border-subtle) bg-(--bg-canvas)'
                }`}
              >
                <button
                  type="button"
                  className="grid gap-2 text-left"
                  onClick={() => onSelectLibrary(library.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-(--text-primary)">
                      {library.label}
                    </p>
                    <span className="rounded-md border border-(--border-default) bg-(--bg-panel) px-2 py-0.5 text-[11px] text-(--text-secondary)">
                      {library.version}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-(--text-secondary)">
                    <span>{formatPackageSize(library.packageSizeKb)}</span>
                    {packageSizeMeta.level !== 'healthy' ? (
                      <>
                        <span>·</span>
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-[11px] ${packageSizeMeta.badgeClassName}`}
                        >
                          {resolvePackageLevelLabel(packageSizeMeta.level)}
                        </span>
                      </>
                    ) : null}
                    <span>·</span>
                    <span>
                      {t('resourceManager.external.exports', {
                        count: library.components.length,
                      })}
                    </span>
                  </div>
                </button>
                {packageSizeMeta.level !== 'healthy' ? (
                  <p
                    className={`rounded-lg border px-2 py-1 text-xs ${packageSizeMeta.bannerClassName}`}
                  >
                    {t('resourceManager.external.sizeWarning', {
                      level: resolvePackageLevelLabel(packageSizeMeta.level),
                      hint: resolvePackageHint(packageSizeMeta.level),
                    })}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    data-testid={`external-library-version-select-${library.id}`}
                    className="h-8 min-w-[140px] rounded-lg border border-(--border-default) bg-transparent px-2 text-xs text-(--text-secondary)"
                    value={library.version}
                    onChange={(event) =>
                      onVersionChange(library.id, event.target.value)
                    }
                  >
                    {library.versions.map((version) => (
                      <option key={version} value={version}>
                        {version}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-testid={`external-library-remove-${library.id}`}
                    className="rounded-lg border border-(--border-default) px-2.5 py-1 text-xs text-(--text-secondary) hover:text-(--text-primary)"
                    onClick={() => onRemoveLibrary(library.id)}
                  >
                    {t('resourceManager.external.actions.remove')}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
