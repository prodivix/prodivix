import { useEffect, useMemo, useState } from 'react';
import { PdxButton, PdxInput, PdxSearch } from '@prodivix/ui';
import { Download, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import {
  collectLocaleMissingStats,
  readI18nStore,
  writeI18nStore,
  type I18nLocaleStore,
  type I18nNamespaceMap,
} from './i18nStore';

type I18nResourcePageProps = {
  embedded?: boolean;
};

type I18nSelection = {
  sourceLocale: string;
  targetLocale: string;
  namespace: string;
  key?: string;
};

type TranslationStatus = 'missing' | 'translated' | 'reviewed';

type TranslationRow = {
  id: string;
  key: string;
  translationsByLocale: Record<string, string>;
  source: string;
  target: string;
  missingLocales: string[];
  status: TranslationStatus;
  hasVariable: boolean;
};

const getI18nSelectionStorageKey = (projectId?: string) =>
  `prodivix.resourceManager.i18n.selection.${projectId?.trim() || 'default'}`;

const getI18nReviewStorageKey = (projectId?: string) =>
  `prodivix.resourceManager.i18n.review.${projectId?.trim() || 'default'}`;

const readSelection = (projectId: string | undefined): I18nSelection | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(
      getI18nSelectionStorageKey(projectId)
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as I18nSelection;
    if (
      !parsed ||
      !parsed.sourceLocale ||
      !parsed.targetLocale ||
      !parsed.namespace
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const readReviewedMap = (
  projectId: string | undefined
): Record<string, boolean> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(getI18nReviewStorageKey(projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightVariables = (value: string) => {
  const matches = value.match(/\{[^}]+\}/g);
  if (!matches || matches.length === 0) return <span>{value || '...'}</span>;
  const pattern = new RegExp(`(${matches.map(escapeRegex).join('|')})`, 'g');
  return value.split(pattern).map((part, index) =>
    /\{[^}]+\}/.test(part) ? (
      <mark
        key={`${part}-${index}`}
        className="rounded bg-black px-1 text-[11px] text-white"
      >
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    )
  );
};

const getCompletionRate = (
  source: Record<string, string>,
  target: Record<string, string>
) => {
  const sourceKeys = Object.keys(source);
  if (sourceKeys.length === 0) return 100;
  const translatedCount = sourceKeys.filter(
    (key) => (target[key] ?? '').trim().length > 0
  ).length;
  return Math.round((translatedCount / sourceKeys.length) * 100);
};

export function I18nResourcePage({ embedded = false }: I18nResourcePageProps) {
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const [store, setStore] = useState<I18nLocaleStore>(() =>
    readI18nStore(projectId)
  );
  const [reviewedMap, setReviewedMap] = useState<Record<string, boolean>>(() =>
    readReviewedMap(projectId)
  );
  const [searchKeyword, setSearchKeyword] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [newLocale, setNewLocale] = useState('');
  const [newNamespace, setNewNamespace] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newSourceValue, setNewSourceValue] = useState('');
  const [selection, setSelection] = useState<I18nSelection>(() => {
    const initialStore = readI18nStore(projectId);
    const stored = readSelection(projectId);
    const localeKeys = Object.keys(initialStore);
    const fallbackSource = localeKeys[0] ?? 'en';
    const fallbackTarget = localeKeys[1] ?? localeKeys[0] ?? 'zh-CN';
    const fallbackNamespace =
      Object.keys(initialStore[fallbackSource] ?? {})[0] ?? 'common';
    if (
      stored &&
      initialStore[stored.sourceLocale] &&
      initialStore[stored.targetLocale] &&
      initialStore[stored.sourceLocale][stored.namespace]
    ) {
      return stored;
    }
    return {
      sourceLocale: fallbackSource,
      targetLocale: fallbackTarget,
      namespace: fallbackNamespace,
    };
  });
  const fileInputId = 'resource-i18n-import-json';

  const locales = useMemo(() => Object.keys(store), [store]);
  const sourceNamespaces = useMemo(
    () => Object.keys(store[selection.sourceLocale] ?? {}),
    [selection.sourceLocale, store]
  );
  const sourceNamespaceMap = (store[selection.sourceLocale] ??
    {}) as I18nNamespaceMap;
  const targetNamespaceMap = (store[selection.targetLocale] ??
    {}) as I18nNamespaceMap;
  const missingStats = useMemo(
    () => collectLocaleMissingStats(store, selection.sourceLocale),
    [selection.sourceLocale, store]
  );

  const namespaceStats = useMemo(
    () =>
      sourceNamespaces.map((namespace) => {
        const source = sourceNamespaceMap[namespace] ?? {};
        const target = targetNamespaceMap[namespace] ?? {};
        const missingCount = Object.keys(source).filter(
          (key) => !(target[key] ?? '').trim()
        ).length;
        return {
          namespace,
          sourceCount: Object.keys(source).length,
          missingCount,
          completionRate: getCompletionRate(source, target),
        };
      }),
    [sourceNamespaceMap, sourceNamespaces, targetNamespaceMap]
  );

  const rows = useMemo<TranslationRow[]>(() => {
    const keySet = new Set<string>();
    locales.forEach((locale) => {
      Object.keys(store[locale]?.[selection.namespace] ?? {}).forEach((key) =>
        keySet.add(key)
      );
    });
    const matchedRows = [...keySet]
      .sort((a, b) => a.localeCompare(b))
      .map((key) => {
        const translationsByLocale = Object.fromEntries(
          locales.map((locale) => [
            locale,
            store[locale]?.[selection.namespace]?.[key] ?? '',
          ])
        );
        const source = translationsByLocale[selection.sourceLocale] ?? '';
        const target = translationsByLocale[selection.targetLocale] ?? '';
        const missingLocales = locales.filter(
          (locale) => !String(translationsByLocale[locale] ?? '').trim()
        );
        const reviewKey = `${selection.targetLocale}::${selection.namespace}::${key}`;
        const reviewed = reviewedMap[reviewKey] === true;
        const status: TranslationStatus =
          target.trim().length === 0
            ? 'missing'
            : reviewed
              ? 'reviewed'
              : 'translated';
        return {
          id: reviewKey,
          key,
          translationsByLocale,
          source,
          target,
          missingLocales,
          status,
          hasVariable: Object.values(translationsByLocale).some((value) =>
            /\{[^}]+\}/.test(value)
          ),
        };
      });
    return matchedRows.filter((row) => {
      const normalizedSearch = searchKeyword.trim().toLowerCase();
      const matchSearch =
        normalizedSearch.length === 0 ||
        row.key.toLowerCase().includes(normalizedSearch) ||
        row.source.toLowerCase().includes(normalizedSearch) ||
        row.target.toLowerCase().includes(normalizedSearch) ||
        Object.values(row.translationsByLocale).some((value) =>
          value.toLowerCase().includes(normalizedSearch)
        );
      if (!matchSearch) return false;
      if (missingOnly && row.missingLocales.length === 0) return false;
      if (reviewOnly && row.status !== 'reviewed') return false;
      return true;
    });
  }, [
    missingOnly,
    reviewOnly,
    reviewedMap,
    searchKeyword,
    selection.namespace,
    selection.targetLocale,
    locales,
    store,
  ]);

  const selectedRow =
    rows.find((row) => row.key === selection.key) ??
    rows[0] ??
    ({
      id: 'empty',
      key: 'empty',
      translationsByLocale: {},
      source: '',
      target: '',
      missingLocales: [],
      status: 'missing',
      hasVariable: false,
    } as TranslationRow);

  const currentNamespaceStats = namespaceStats.find(
    (item) => item.namespace === selection.namespace
  );

  useEffect(() => {
    writeI18nStore(projectId, store);
  }, [projectId, store]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      getI18nReviewStorageKey(projectId),
      JSON.stringify(reviewedMap)
    );
  }, [projectId, reviewedMap]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      getI18nSelectionStorageKey(projectId),
      JSON.stringify(selection)
    );
  }, [projectId, selection]);

  useEffect(() => {
    if (!store[selection.sourceLocale]) {
      const fallbackSource = locales[0];
      if (!fallbackSource) return;
      const fallbackNamespace =
        Object.keys(store[fallbackSource] ?? {})[0] ?? 'common';
      setSelection((current) => ({
        ...current,
        sourceLocale: fallbackSource,
        namespace: fallbackNamespace,
      }));
    }
    if (!store[selection.targetLocale]) {
      const fallbackTarget = locales[1] ?? locales[0];
      if (!fallbackTarget) return;
      setSelection((current) => ({ ...current, targetLocale: fallbackTarget }));
    }
    if (!store[selection.sourceLocale]?.[selection.namespace]) {
      const fallbackNamespace =
        Object.keys(store[selection.sourceLocale] ?? {})[0] ?? 'common';
      setSelection((current) => ({ ...current, namespace: fallbackNamespace }));
    }
  }, [
    locales,
    selection.namespace,
    selection.sourceLocale,
    selection.targetLocale,
    store,
  ]);

  useEffect(() => {
    if (rows.length === 0) return;
    if (!selection.key || !rows.some((row) => row.key === selection.key)) {
      setSelection((current) => ({ ...current, key: rows[0].key }));
    }
  }, [rows, selection.key]);

  const updateLocaleValue = (locale: string, key: string, value: string) => {
    setStore((current) => ({
      ...current,
      [locale]: {
        ...(current[locale] ?? {}),
        [selection.namespace]: {
          ...(current[locale]?.[selection.namespace] ?? {}),
          [key]: value,
        },
      },
    }));
  };

  const toggleReviewed = (row: TranslationRow) => {
    setReviewedMap((current) => ({
      ...current,
      [row.id]: !current[row.id],
    }));
  };

  const addLocale = () => {
    const locale = newLocale.trim();
    if (!locale || store[locale]) return;
    setStore((current) => ({
      ...current,
      [locale]: { common: {} },
    }));
    setSelection((current) => ({ ...current, targetLocale: locale }));
    setNewLocale('');
  };

  const addNamespace = () => {
    const namespace = newNamespace.trim();
    if (!namespace) return;
    setStore((current) => ({
      ...current,
      [selection.sourceLocale]: {
        ...(current[selection.sourceLocale] ?? {}),
        [namespace]: {},
      },
      [selection.targetLocale]: {
        ...(current[selection.targetLocale] ?? {}),
        [namespace]: {},
      },
    }));
    setSelection((current) => ({ ...current, namespace }));
    setNewNamespace('');
  };

  const addKey = () => {
    const key = newKey.trim();
    if (!key) return;
    setStore((current) => {
      const next: I18nLocaleStore = { ...current };
      locales.forEach((locale) => {
        next[locale] = {
          ...(current[locale] ?? {}),
          [selection.namespace]: {
            ...(current[locale]?.[selection.namespace] ?? {}),
            [key]: locale === selection.sourceLocale ? newSourceValue : '',
          },
        };
      });
      return next;
    });
    setSelection((current) => ({ ...current, key }));
    setNewKey('');
    setNewSourceValue('');
  };

  const deleteKey = (key: string) => {
    setStore((current) => {
      const next: I18nLocaleStore = { ...current };
      locales.forEach((locale) => {
        const currentNamespace = current[locale]?.[selection.namespace] ?? {};
        const nextNamespace = { ...currentNamespace };
        delete nextNamespace[key];
        next[locale] = {
          ...(current[locale] ?? {}),
          [selection.namespace]: nextNamespace,
        };
      });
      return next;
    });
    setReviewedMap((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([reviewKey]) =>
            !reviewKey.endsWith(`::${selection.namespace}::${key}`)
        )
      )
    );
    if (selection.key === key) {
      setSelection((current) => ({ ...current, key: undefined }));
    }
  };

  const exportLocale = () => {
    if (typeof window === 'undefined') return;
    const payload = store[selection.targetLocale] ?? {};
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selection.targetLocale}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const shellClassName = embedded
    ? 'grid gap-4'
    : 'mx-auto grid w-full max-w-[1480px] gap-4 px-6 py-6';

  return (
    <section className={shellClassName}>
      <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
        <h2 className="text-base font-semibold text-(--text-primary)">
          {t('resourceManager.i18n.header.title')}
        </h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          {t('resourceManager.i18n.header.description')}
        </p>
      </article>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="grid gap-3 rounded-xl border border-black/10 bg-(--bg-canvas) p-3">
          <PdxSearch
            size="Small"
            value={searchKeyword}
            onChange={setSearchKeyword}
            placeholder={t('resourceManager.i18n.searchPlaceholder')}
          />

          <div className="grid gap-1 rounded-lg border border-black/8 bg-black/[0.02] p-2 text-xs">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={missingOnly}
                onChange={(event) => setMissingOnly(event.target.checked)}
              />
              {t('resourceManager.i18n.filters.missingOnly')}
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={reviewOnly}
                onChange={(event) => setReviewOnly(event.target.checked)}
              />
              {t('resourceManager.i18n.filters.reviewedOnly')}
            </label>
          </div>

          <div className="grid gap-2">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-(--text-muted) uppercase">
              {t('resourceManager.i18n.modules')}
            </p>
            <div className="grid gap-1">
              {namespaceStats.map((item) => (
                <button
                  key={item.namespace}
                  type="button"
                  className={`grid gap-1 rounded-md border px-2 py-1.5 text-left ${
                    selection.namespace === item.namespace
                      ? 'border-black/30 bg-black text-white'
                      : 'border-black/8 bg-white hover:border-black/20'
                  }`}
                  onClick={() =>
                    setSelection((current) => ({
                      ...current,
                      namespace: item.namespace,
                    }))
                  }
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
              {selection.targetLocale}:{' '}
              {t('resourceManager.i18n.progressComplete', {
                rate: currentNamespaceStats?.completionRate ?? 100,
              })}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
              <div
                className="h-full bg-black"
                style={{
                  width: `${currentNamespaceStats?.completionRate ?? 100}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-(--text-secondary)">
              {t('resourceManager.i18n.missingKeys', {
                count: missingStats[selection.targetLocale] ?? 0,
              })}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <PdxInput
              type="Text"
              size="Small"
              value={newLocale}
              onChange={setNewLocale}
              placeholder={t('resourceManager.i18n.newLocalePlaceholder')}
            />
            <PdxButton
              text={t('resourceManager.i18n.actions.addLocale')}
              size="Tiny"
              category="Secondary"
              onClick={addLocale}
            />
            <PdxInput
              type="Text"
              size="Small"
              value={newNamespace}
              onChange={setNewNamespace}
              placeholder={t('resourceManager.i18n.newModulePlaceholder')}
            />
            <PdxButton
              text={t('resourceManager.i18n.actions.addModule')}
              size="Tiny"
              category="Secondary"
              onClick={addNamespace}
            />
          </div>
        </aside>

        <article className="grid gap-3 rounded-xl border border-black/10 bg-(--bg-canvas) p-3">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-(--text-primary)">
              {selection.namespace}
            </h3>
            <div className="flex items-center gap-1">
              <PdxButton
                text={t('resourceManager.i18n.actions.export')}
                size="Tiny"
                category="Secondary"
                icon={<Download size={12} />}
                iconPosition="Left"
                onClick={exportLocale}
              />
              <label
                htmlFor={fileInputId}
                className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-black/12 px-2 text-xs hover:bg-black/5"
              >
                <Upload size={12} />
                {t('resourceManager.i18n.actions.import')}
              </label>
              <input
                id={fileInputId}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const raw = await file.text();
                    const parsed = JSON.parse(raw) as Record<
                      string,
                      Record<string, string>
                    >;
                    setStore((current) => ({
                      ...current,
                      [selection.targetLocale]: Object.fromEntries(
                        Object.entries(parsed).map(([namespace, values]) => [
                          namespace,
                          Object.fromEntries(
                            Object.entries(values).map(([key, value]) => [
                              key,
                              typeof value === 'string'
                                ? value
                                : String(value ?? ''),
                            ])
                          ),
                        ])
                      ),
                    }));
                  } catch {
                    // ignore invalid json import
                  } finally {
                    event.currentTarget.value = '';
                  }
                }}
              />
            </div>
          </header>

          <div className="overflow-x-auto rounded-lg border border-black/8">
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-black/[0.04] text-(--text-secondary)">
                <tr>
                  <th className="min-w-[220px] px-2 py-2 text-left font-semibold">
                    {t('resourceManager.i18n.table.key')}
                  </th>
                  {locales.map((locale) => (
                    <th
                      key={`col-${locale}`}
                      className="min-w-[220px] px-2 py-2 text-left font-semibold"
                    >
                      {locale}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-left font-semibold">
                    {t('resourceManager.i18n.table.status')}
                  </th>
                  <th className="px-2 py-2 text-left font-semibold">
                    {t('resourceManager.i18n.table.action')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-t border-black/8 ${
                      selection.key === row.key ? 'bg-black/[0.03]' : 'bg-white'
                    }`}
                    onMouseEnter={() =>
                      setSelection((current) => ({ ...current, key: row.key }))
                    }
                  >
                    <td className="max-w-[220px] px-2 py-2 align-top">
                      <button
                        type="button"
                        className="truncate text-left font-mono text-[11px] text-(--text-primary)"
                        onClick={() =>
                          setSelection((current) => ({
                            ...current,
                            key: row.key,
                          }))
                        }
                      >
                        {row.key}
                      </button>
                    </td>
                    {locales.map((locale) => {
                      const localeValue =
                        row.translationsByLocale[locale] ?? '';
                      const isMissing = !localeValue.trim();
                      const isSourceLocale = locale === selection.sourceLocale;
                      return (
                        <td
                          key={`${row.id}-${locale}`}
                          className="min-w-[220px] px-2 py-2 align-top"
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
                            onFocus={() =>
                              setSelection((current) => ({
                                ...current,
                                key: row.key,
                              }))
                            }
                            onChange={(event) =>
                              updateLocaleValue(
                                locale,
                                row.key,
                                event.target.value
                              )
                            }
                          />
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 align-top">
                      <button
                        type="button"
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          row.status === 'missing'
                            ? 'bg-amber-100 text-amber-700'
                            : row.status === 'reviewed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                        onClick={() => toggleReviewed(row)}
                      >
                        {t(`resourceManager.i18n.status.${row.status}`)}
                      </button>
                    </td>
                    <td className="px-2 py-2 align-top">
                      <button
                        type="button"
                        className="rounded-md border border-red-200 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50"
                        onClick={() => deleteKey(row.key)}
                      >
                        {t('resourceManager.i18n.actions.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-dashed border-black/12 bg-black/[0.02]">
                  <td className="max-w-[220px] px-2 py-2 align-top">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center border-0 bg-transparent p-0 text-[14px] leading-none text-(--text-secondary) hover:text-(--text-primary)"
                        aria-label="Add key"
                        onClick={addKey}
                      >
                        +
                      </button>
                      <PdxInput
                        type="Text"
                        size="Small"
                        value={newKey}
                        onChange={setNewKey}
                        className="w-full"
                        placeholder={t(
                          'resourceManager.i18n.newKeyPlaceholder'
                        )}
                      />
                    </div>
                  </td>
                  {locales.map((locale) => (
                    <td
                      key={`new-row-${locale}`}
                      className="min-w-[220px] px-2 py-2 align-top"
                    >
                      {locale === selection.sourceLocale ? (
                        <PdxInput
                          type="Text"
                          size="Small"
                          value={newSourceValue}
                          onChange={setNewSourceValue}
                          className="w-full"
                          placeholder={t(
                            'resourceManager.i18n.newSourcePlaceholder',
                            { locale: selection.sourceLocale }
                          )}
                        />
                      ) : (
                        <div className="inline-flex h-8 w-full items-center rounded border border-dashed border-black/12 px-2 text-[11px] text-(--text-muted)">
                          {t('resourceManager.i18n.empty')}
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-2 align-top">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                      {t('resourceManager.i18n.new')}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <PdxButton
                      text={t('resourceManager.i18n.actions.add')}
                      size="Tiny"
                      category="Secondary"
                      onClick={addKey}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <aside className="grid gap-3 rounded-xl border border-black/10 bg-(--bg-canvas) p-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.08em] text-(--text-muted) uppercase">
              {t('resourceManager.i18n.livePreview')}
            </p>
            <h4 className="mt-1 text-sm font-semibold text-(--text-primary)">
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
      </div>
    </section>
  );
}
