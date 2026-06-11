import { Download, Trash2, Upload } from 'lucide-react';
import { PdxButton, PdxInput, PdxSearch } from '@prodivix/ui';
import type { ReactNode } from 'react';
import type { NamespaceStats, TranslationRow } from './i18nResourceModel';

type I18nResourceSidebarProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  searchKeyword: string;
  missingOnly: boolean;
  reviewOnly: boolean;
  namespaceStats: NamespaceStats[];
  selectedNamespace: string;
  currentNamespaceStats?: NamespaceStats;
  progressRate: number;
  missingCount: number;
  newLocale: string;
  newNamespace: string;
  onSearchKeywordChange: (value: string) => void;
  onMissingOnlyChange: (value: boolean) => void;
  onReviewOnlyChange: (value: boolean) => void;
  onSelectNamespace: (namespace: string) => void;
  onNewLocaleChange: (value: string) => void;
  onNewNamespaceChange: (value: string) => void;
  onAddLocale: () => void;
  onAddNamespace: () => void;
};

export function I18nResourceSidebar({
  t,
  searchKeyword,
  missingOnly,
  reviewOnly,
  namespaceStats,
  selectedNamespace,
  currentNamespaceStats,
  progressRate,
  missingCount,
  newLocale,
  newNamespace,
  onSearchKeywordChange,
  onMissingOnlyChange,
  onReviewOnlyChange,
  onSelectNamespace,
  onNewLocaleChange,
  onNewNamespaceChange,
  onAddLocale,
  onAddNamespace,
}: I18nResourceSidebarProps) {
  return (
    <aside className="grid gap-3 rounded-xl border border-black/10 bg-(--bg-canvas) p-3">
      <PdxSearch
        size="Small"
        value={searchKeyword}
        onChange={onSearchKeywordChange}
        placeholder={t('resourceManager.i18n.searchPlaceholder')}
      />

      <div className="grid gap-1 rounded-lg border border-black/8 bg-black/[0.02] p-2 text-xs">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={missingOnly}
            onChange={(event) => onMissingOnlyChange(event.target.checked)}
          />
          {t('resourceManager.i18n.filters.missingOnly')}
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={reviewOnly}
            onChange={(event) => onReviewOnlyChange(event.target.checked)}
          />
          {t('resourceManager.i18n.filters.reviewedOnly')}
        </label>
      </div>

      <div className="grid gap-2">
        <p className="text-[11px] font-medium tracking-[0.08em] text-(--text-muted) uppercase">
          {t('resourceManager.i18n.modules')}
        </p>
        <div className="grid gap-1">
          {namespaceStats.map((item) => (
            <button
              key={item.namespace}
              type="button"
              className={`grid gap-1 rounded-md border px-2 py-1.5 text-left ${
                selectedNamespace === item.namespace
                  ? 'border-black/30 bg-black text-white'
                  : 'border-black/8 bg-white hover:border-black/20'
              }`}
              onClick={() => onSelectNamespace(item.namespace)}
            >
              <span className="truncate text-xs font-medium">
                {item.namespace}
              </span>
              <span className="text-[11px] opacity-80">
                {t('resourceManager.i18n.moduleStats', {
                  keys: item.sourceCount,
                  missing: item.missingCount,
                })}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 rounded-lg border border-black/8 bg-black/[0.02] p-2">
        <p className="text-[11px] tracking-[0.08em] text-(--text-muted) uppercase">
          {t('resourceManager.i18n.progress')}
        </p>
        <p className="text-xs text-(--text-secondary)">
          {selectedNamespace}:{' '}
          {t('resourceManager.i18n.progressComplete', {
            rate: currentNamespaceStats?.completionRate ?? 100,
          })}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
          <div
            className="h-full bg-black"
            style={{
              width: `${progressRate}%`,
            }}
          />
        </div>
        <p className="text-[11px] text-(--text-secondary)">
          {t('resourceManager.i18n.missingKeys', {
            count: missingCount,
          })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <PdxInput
          type="Text"
          size="Small"
          value={newLocale}
          onChange={onNewLocaleChange}
          placeholder={t('resourceManager.i18n.newLocalePlaceholder')}
        />
        <PdxButton
          text={t('resourceManager.i18n.actions.addLocale')}
          size="Tiny"
          category="Secondary"
          onClick={onAddLocale}
        />
        <PdxInput
          type="Text"
          size="Small"
          value={newNamespace}
          onChange={onNewNamespaceChange}
          placeholder={t('resourceManager.i18n.newModulePlaceholder')}
        />
        <PdxButton
          text={t('resourceManager.i18n.actions.addModule')}
          size="Tiny"
          category="Secondary"
          onClick={onAddNamespace}
        />
      </div>
    </aside>
  );
}

type I18nResourceTableProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  fileInputId: string;
  locales: string[];
  rows: TranslationRow[];
  selectedNamespace: string;
  sourceLocale: string;
  selectedKey?: string;
  newKey: string;
  newSourceValue: string;
  onImport: (file: File) => Promise<void>;
  onExport: () => void;
  onDeleteKey: (key: string) => void;
  onSelectKey: (key: string) => void;
  onUpdateLocaleValue: (locale: string, key: string, value: string) => void;
  onToggleReviewed: (row: TranslationRow) => void;
  onNewKeyChange: (value: string) => void;
  onNewSourceValueChange: (value: string) => void;
  onAddKey: () => void;
};

export function I18nResourceTable({
  t,
  fileInputId,
  locales,
  rows,
  selectedNamespace,
  sourceLocale,
  selectedKey,
  newKey,
  newSourceValue,
  onImport,
  onExport,
  onDeleteKey,
  onSelectKey,
  onUpdateLocaleValue,
  onToggleReviewed,
  onNewKeyChange,
  onNewSourceValueChange,
  onAddKey,
}: I18nResourceTableProps) {
  return (
    <article className="grid gap-3 rounded-xl border border-black/10 bg-(--bg-canvas) p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-(--text-primary)">
          {selectedNamespace}
        </h3>
        <div className="flex items-center gap-1">
          <label
            htmlFor={fileInputId}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-(--text-secondary) hover:bg-black/5 hover:text-(--text-primary)"
            aria-label={t('resourceManager.i18n.actions.import')}
            title={t('resourceManager.i18n.actions.import')}
          >
            <Upload size={14} aria-hidden="true" />
          </label>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent text-(--text-secondary) hover:bg-black/5 hover:text-(--text-primary)"
            aria-label={t('resourceManager.i18n.actions.export')}
            title={t('resourceManager.i18n.actions.export')}
            onClick={onExport}
          >
            <Download size={14} aria-hidden="true" />
          </button>
          <input
            id={fileInputId}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              await onImport(file);
              event.currentTarget.value = '';
            }}
          />
        </div>
      </header>

      <div className="overflow-x-auto rounded-lg border border-black/8">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-black/[0.04] text-(--text-secondary)">
            <tr>
              <th className="min-w-[220px] px-2 py-2 text-left align-middle font-semibold">
                {t('resourceManager.i18n.table.key')}
              </th>
              {locales.map((locale) => (
                <th
                  key={`col-${locale}`}
                  className="min-w-[220px] px-2 py-2 text-left align-middle font-semibold"
                >
                  {locale}
                </th>
              ))}
              <th className="w-[88px] min-w-[88px] px-2 py-2 text-left align-middle font-semibold whitespace-nowrap">
                {t('resourceManager.i18n.table.status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t border-black/8 ${
                  selectedKey === row.key ? 'bg-black/[0.03]' : 'bg-white'
                }`}
                onMouseEnter={() => onSelectKey(row.key)}
              >
                <td className="max-w-[220px] px-2 py-2 align-middle">
                  <div className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-(--text-primary)"
                      onClick={() => onSelectKey(row.key)}
                    >
                      {row.key}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-(--text-muted) hover:bg-red-50 hover:text-red-700"
                      aria-label={t('resourceManager.i18n.actions.delete')}
                      title={t('resourceManager.i18n.actions.delete')}
                      onClick={() => onDeleteKey(row.key)}
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </div>
                </td>
                {locales.map((locale) => {
                  const localeValue = row.translationsByLocale[locale] ?? '';
                  const isMissing = !localeValue.trim();
                  const isSourceLocale = locale === sourceLocale;
                  return (
                    <td
                      key={`${row.id}-${locale}`}
                      className="min-w-[220px] px-2 py-2 align-middle"
                    >
                      <input
                        aria-label={`translation-${row.key}-${locale}`}
                        value={localeValue}
                        className={`h-8 w-full rounded border px-2 outline-none ${
                          isMissing
                            ? 'border-amber-500/45 bg-amber-50/60'
                            : 'border-black/12 bg-white focus:border-black/30'
                        } ${
                          isSourceLocale
                            ? 'font-medium text-(--text-primary)'
                            : 'text-(--text-secondary)'
                        }`}
                        onFocus={() => onSelectKey(row.key)}
                        onChange={(event) =>
                          onUpdateLocaleValue(
                            locale,
                            row.key,
                            event.target.value
                          )
                        }
                      />
                    </td>
                  );
                })}
                <td className="w-[88px] min-w-[88px] px-2 py-2 align-middle">
                  <button
                    type="button"
                    className={`inline-flex min-w-[52px] items-center justify-center rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap ${
                      row.status === 'missing'
                        ? 'bg-amber-100 text-amber-700'
                        : row.status === 'reviewed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : row.status === 'sourceMissing'
                            ? 'bg-amber-200 text-amber-950'
                            : 'bg-slate-100 text-slate-700'
                    }`}
                    onClick={() => onToggleReviewed(row)}
                  >
                    {t(`resourceManager.i18n.status.${row.status}`)}
                  </button>
                </td>
              </tr>
            ))}
            <tr className="border-t border-dashed border-black/12 bg-black/[0.02]">
              <td className="max-w-[220px] px-2 py-2 align-middle">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 items-center justify-center rounded border-0 bg-transparent p-0 text-[14px] leading-none text-(--text-secondary) hover:bg-black/6 hover:text-(--text-primary) focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:outline-none"
                    aria-label="Add key"
                    onClick={onAddKey}
                  >
                    +
                  </button>
                  <PdxInput
                    type="Text"
                    size="Small"
                    value={newKey}
                    onChange={onNewKeyChange}
                    className="w-full"
                    placeholder={t('resourceManager.i18n.newKeyPlaceholder')}
                  />
                </div>
              </td>
              {locales.map((locale) => (
                <td
                  key={`new-row-${locale}`}
                  className="min-w-[220px] px-2 py-2 align-middle"
                >
                  {locale === sourceLocale ? (
                    <PdxInput
                      type="Text"
                      size="Small"
                      value={newSourceValue}
                      onChange={onNewSourceValueChange}
                      className="w-full"
                      placeholder={t(
                        'resourceManager.i18n.newSourcePlaceholder',
                        {
                          locale: sourceLocale,
                        }
                      )}
                    />
                  ) : (
                    <div className="inline-flex h-8 w-full items-center rounded border border-dashed border-black/12 px-2 text-[11px] text-(--text-muted)">
                      {t('resourceManager.i18n.empty')}
                    </div>
                  )}
                </td>
              ))}
              <td className="w-[88px] min-w-[88px] px-2 py-2 align-middle" />
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}

type I18nResourcePreviewProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  selectedRow: TranslationRow;
  highlightVariables: (value: string) => ReactNode;
};

export function I18nResourcePreview({
  t,
  selectedRow,
  highlightVariables,
}: I18nResourcePreviewProps) {
  return (
    <aside className="grid gap-3 rounded-xl border border-black/10 bg-(--bg-canvas) p-3">
      <div>
        <p className="text-[11px] font-medium tracking-[0.08em] text-(--text-muted) uppercase">
          {t('resourceManager.i18n.livePreview')}
        </p>
        <h4 className="mt-1 text-sm font-medium text-(--text-primary)">
          {selectedRow.key}
        </h4>
      </div>

      <article className="grid gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-3">
        <p className="text-[11px] tracking-[0.08em] text-(--text-muted) uppercase">
          {t('resourceManager.i18n.componentPreview')}
        </p>
        <button
          type="button"
          className="inline-flex h-9 w-full items-center justify-center overflow-hidden rounded-md border border-black/14 bg-white px-3 text-sm text-ellipsis whitespace-nowrap text-(--text-primary)"
        >
          {selectedRow.target || selectedRow.source || '...'}
        </button>
        <div className="rounded-md border border-black/10 bg-white p-2 text-xs text-(--text-secondary)">
          {highlightVariables(selectedRow.target || selectedRow.source)}
        </div>
      </article>

      <div className="grid gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-3 text-xs text-(--text-secondary)">
        <p>
          {t('resourceManager.i18n.baseLength')}:{' '}
          <strong>{selectedRow.source.length}</strong>
        </p>
        <p>
          {t('resourceManager.i18n.previewLength')}:{' '}
          <strong>{selectedRow.target.length}</strong>
        </p>
        <p
          className={
            selectedRow.target.length >
            Math.max(selectedRow.source.length * 1.35, 24)
              ? 'text-amber-700'
              : 'text-emerald-700'
          }
        >
          {selectedRow.target.length >
          Math.max(selectedRow.source.length * 1.35, 24)
            ? t('resourceManager.i18n.overflowRisk')
            : t('resourceManager.i18n.layoutHealthy')}
        </p>
        {selectedRow.hasVariable ? (
          <p className="text-slate-700">
            {t('resourceManager.i18n.containsVariables')}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
