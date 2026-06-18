import { type I18nLocaleStore, type I18nNamespaceMap } from './i18nStore';

export type I18nSelection = {
  sourceLocale: string;
  targetLocale: string;
  namespace: string;
  key?: string;
};

export type TranslationStatus =
  | 'sourceMissing'
  | 'missing'
  | 'translated'
  | 'reviewed';

export type TranslationRow = {
  id: string;
  key: string;
  translationsByLocale: Record<string, string>;
  source: string;
  target: string;
  missingLocales: string[];
  status: TranslationStatus;
  hasVariable: boolean;
};

export type NamespaceStats = {
  namespace: string;
  sourceCount: number;
  missingCount: number;
  completionRate: number;
};

export const getI18nSelectionStorageKey = (projectId?: string) =>
  `prodivix.resourceManager.i18n.selection.${projectId?.trim() || 'default'}`;

export const readSelection = (
  projectId: string | undefined
): I18nSelection | null => {
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

export const getTranslationStatus = ({
  source,
  target,
  reviewed,
}: {
  source: string;
  target: string;
  reviewed: boolean;
}): TranslationStatus => {
  if (source.trim().length === 0) return 'sourceMissing';
  if (target.trim().length === 0) return 'missing';
  return reviewed ? 'reviewed' : 'translated';
};

export const buildNamespaceStats = ({
  sourceNamespaces,
  sourceNamespaceMap,
  targetNamespaceMap,
}: {
  sourceNamespaces: string[];
  sourceNamespaceMap: I18nNamespaceMap;
  targetNamespaceMap: I18nNamespaceMap;
}): NamespaceStats[] =>
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
  });

export const buildTranslationRows = ({
  locales,
  store,
  selection,
  reviewedMap,
  searchKeyword,
  missingOnly,
  reviewOnly,
}: {
  locales: string[];
  store: I18nLocaleStore;
  selection: I18nSelection;
  reviewedMap: Record<string, boolean>;
  searchKeyword: string;
  missingOnly: boolean;
  reviewOnly: boolean;
}): TranslationRow[] => {
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
      return {
        id: reviewKey,
        key,
        translationsByLocale,
        source,
        target,
        missingLocales,
        status: getTranslationStatus({
          source,
          target,
          reviewed: reviewedMap[reviewKey] === true,
        }),
        hasVariable: Object.values(translationsByLocale).some((value) =>
          /\{[^}]+\}/.test(value)
        ),
      };
    });
  const normalizedSearch = searchKeyword.trim().toLowerCase();
  return matchedRows.filter((row) => {
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
};
