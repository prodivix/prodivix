import type { ActiveLibrary, PackageSizeThresholds } from './types';
import { useTranslation } from 'react-i18next';
import { formatPackageSize, getPackageSizeMeta } from './viewUtils';

type ExternalLibraryDetailsPanelProps = {
  selectedLibrary: ActiveLibrary | null;
  adapterArtifacts: readonly Readonly<{ id: string; path: string }>[];
  adapterBusy: boolean;
  adapterError: string;
  packageSizeThresholds: PackageSizeThresholds;
  onAdapterArtifactChange: (
    libraryId: string,
    artifactId: string | null
  ) => void;
  onCreateAdapter: (libraryId: string) => void;
  onOpenAdapter: (artifactId: string) => void;
  onVersionQuickSwitch: (libraryId: string, version: string) => void;
};

const LICENSE_REFERENCE_LINKS: Record<string, string> = {
  mit: 'https://spdx.org/licenses/MIT.html',
  'apache-2.0': 'https://spdx.org/licenses/Apache-2.0.html',
  'bsd-2-clause': 'https://spdx.org/licenses/BSD-2-Clause.html',
  'bsd-3-clause': 'https://spdx.org/licenses/BSD-3-Clause.html',
  'cc-by-4.0': 'https://spdx.org/licenses/CC-BY-4.0.html',
  isc: 'https://spdx.org/licenses/ISC.html',
  'gpl-3.0': 'https://spdx.org/licenses/GPL-3.0-only.html',
  'lgpl-3.0': 'https://spdx.org/licenses/LGPL-3.0-only.html',
  'agpl-3.0': 'https://spdx.org/licenses/AGPL-3.0-only.html',
  'mpl-2.0': 'https://spdx.org/licenses/MPL-2.0.html',
};

const resolveLicenseReferenceLink = (licenseText: string): string | null => {
  const normalized = licenseText.trim();
  if (normalized.length === 0) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;

  const compact = normalized
    .replace(/\s+license$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const directByName = LICENSE_REFERENCE_LINKS[compact];
  if (directByName) return directByName;

  if (/^[a-z0-9-.+]+$/i.test(compact)) {
    const directBySpdx = LICENSE_REFERENCE_LINKS[compact.toLowerCase()];
    if (directBySpdx) return directBySpdx;
  }

  if (compact === 'apache 2.0' || compact === 'apache-2.0') {
    return LICENSE_REFERENCE_LINKS['apache-2.0'];
  }
  if (compact === 'cc by 4.0' || compact === 'cc-by 4.0') {
    return LICENSE_REFERENCE_LINKS['cc-by-4.0'];
  }
  if (compact === 'mit license') {
    return LICENSE_REFERENCE_LINKS.mit;
  }

  return null;
};

const LICENSE_SEPARATOR_PATTERN = /(\s+\+\s+|\s+AND\s+|\s+OR\s+)/i;

const renderLicenseWithLinks = (licenseText: string) => {
  const parts = licenseText
    .split(LICENSE_SEPARATOR_PATTERN)
    .filter((part) => part.length > 0);

  return parts.map((part, index) => {
    const isSeparator = LICENSE_SEPARATOR_PATTERN.test(part);
    if (isSeparator) {
      return (
        <span key={`license-separator-${part}-${index}`} className="mx-0.5">
          {part.trim()}
        </span>
      );
    }

    const link = resolveLicenseReferenceLink(part);
    if (!link) {
      return (
        <span key={`license-token-${part}-${index}`} className="font-semibold">
          {part.trim()}
        </span>
      );
    }

    return (
      <a
        key={`license-token-${part}-${index}`}
        href={link}
        target="_blank"
        rel="noreferrer"
        className="font-semibold underline decoration-(--border-strong) underline-offset-2 hover:text-(--text-primary)"
      >
        {part.trim()}
      </a>
    );
  });
};

export function ExternalLibraryDetailsPanel({
  selectedLibrary,
  adapterArtifacts,
  adapterBusy,
  adapterError,
  packageSizeThresholds,
  onAdapterArtifactChange,
  onCreateAdapter,
  onOpenAdapter,
  onVersionQuickSwitch,
}: ExternalLibraryDetailsPanelProps) {
  const { t } = useTranslation('editor');
  const packageSizeMeta = selectedLibrary
    ? getPackageSizeMeta(selectedLibrary.packageSizeKb, packageSizeThresholds)
    : null;

  const packageLevelLabel = packageSizeMeta
    ? t(`resourceManager.external.package.level.${packageSizeMeta.level}`)
    : '';
  const packageHint = packageSizeMeta
    ? t(`resourceManager.external.package.hint.${packageSizeMeta.level}`)
    : '';

  return (
    <aside className="grid gap-3 self-start rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-3">
      <header>
        <h3 className="text-sm font-medium text-(--text-primary)">
          {t('resourceManager.external.details.title')}
        </h3>
      </header>
      {!selectedLibrary ? (
        <div className="rounded-lg border border-dashed border-(--border-default) bg-(--bg-canvas) p-4 text-sm text-(--text-secondary)">
          {t('resourceManager.external.details.empty')}
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="rounded-lg border border-(--border-subtle) bg-(--bg-canvas) p-3">
            <p className="text-sm font-medium text-(--text-primary)">
              {selectedLibrary.label}
            </p>
            <p className="mt-2 text-xs text-(--text-secondary)">
              {selectedLibrary.description}
            </p>
            <p className="mt-2 text-xs text-(--text-muted)">
              {t('resourceManager.external.details.license')}:{' '}
              {renderLicenseWithLinks(selectedLibrary.license)}
            </p>
          </div>
          {packageSizeMeta ? (
            <p
              className={`rounded-lg border px-3 py-2 text-xs ${packageSizeMeta.bannerClassName}`}
            >
              {packageSizeMeta.level === 'healthy'
                ? t('resourceManager.external.details.sizeHealthy', {
                    size: formatPackageSize(selectedLibrary.packageSizeKb),
                  })
                : t('resourceManager.external.details.sizeWarning', {
                    level: packageLevelLabel,
                    size: formatPackageSize(selectedLibrary.packageSizeKb),
                    hint: packageHint,
                  })}
            </p>
          ) : null}
          <div className="rounded-lg border border-(--border-subtle) bg-(--bg-canvas) p-3">
            <p className="text-xs font-medium text-(--text-secondary)">
              {t('resourceManager.external.adapter.title')}
            </p>
            <p className="mt-1 text-xs text-(--text-muted)">
              {t('resourceManager.external.adapter.description')}
            </p>
            <select
              className="mt-3 w-full rounded-md border border-(--border-default) bg-(--bg-panel) px-2 py-1.5 text-xs text-(--text-primary)"
              value={selectedLibrary.adapter?.reference.artifactId ?? ''}
              disabled={adapterBusy}
              onChange={(event) =>
                onAdapterArtifactChange(
                  selectedLibrary.id,
                  event.target.value || null
                )
              }
            >
              <option value="">
                {t('resourceManager.external.adapter.unbound')}
              </option>
              {adapterArtifacts.map((artifact) => (
                <option key={artifact.id} value={artifact.id}>
                  {artifact.path}
                </option>
              ))}
            </select>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-(--border-default) px-2 py-1 text-xs text-(--text-secondary) hover:text-(--text-primary) disabled:opacity-40"
                disabled={adapterBusy}
                onClick={() => onCreateAdapter(selectedLibrary.id)}
              >
                {t('resourceManager.external.adapter.create')}
              </button>
              {selectedLibrary.adapter ? (
                <button
                  type="button"
                  className="rounded-md border border-(--border-default) px-2 py-1 text-xs text-(--text-secondary) hover:text-(--text-primary) disabled:opacity-40"
                  disabled={adapterBusy}
                  onClick={() =>
                    onOpenAdapter(selectedLibrary.adapter!.reference.artifactId)
                  }
                >
                  {t('resourceManager.external.adapter.open')}
                </button>
              ) : null}
            </div>
            {adapterError ? (
              <p className="mt-2 text-xs text-red-600">{adapterError}</p>
            ) : null}
          </div>
          <div className="rounded-lg border border-(--border-subtle) bg-(--bg-canvas) p-3">
            <p className="text-xs font-medium text-(--text-secondary)">
              {t('resourceManager.external.details.providedComponents')}
            </p>
            <ul className="mt-2 grid max-h-44 gap-1 overflow-auto">
              {selectedLibrary.components.map((componentName) => (
                <li
                  key={`${selectedLibrary.id}-${componentName}`}
                  className="rounded-md border border-(--border-subtle) px-2 py-1 text-xs text-(--text-secondary)"
                >
                  {componentName}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-(--border-subtle) bg-(--bg-canvas) p-3">
            <p className="text-xs font-medium text-(--text-secondary)">
              {t('resourceManager.external.details.versionSwitcher')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedLibrary.versions.map((version) => (
                <button
                  key={`${selectedLibrary.id}-${version}`}
                  type="button"
                  className={`rounded-md border px-2 py-1 text-xs ${
                    version === selectedLibrary.version
                      ? 'border-(--text-primary) bg-(--text-primary) text-(--text-inverse)'
                      : 'border-(--border-default) text-(--text-secondary) hover:text-(--text-primary)'
                  }`}
                  onClick={() =>
                    onVersionQuickSwitch(selectedLibrary.id, version)
                  }
                >
                  {version}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
