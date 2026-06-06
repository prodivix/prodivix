export type I18nNamespaceMap = Record<string, Record<string, string>>;
export type I18nLocaleStore = Record<string, I18nNamespaceMap>;

const getI18nStoreStorageKey = (projectId?: string) =>
  `prodivix.i18nStore.${projectId?.trim() || 'default'}`;

const normalizeRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

export const createDefaultI18nStore = (): I18nLocaleStore => ({
  en: {
    common: {
      appName: 'Prodivix',
      save: 'Save',
    },
  },
  'zh-CN': {
    common: {
      appName: 'Prodivix',
      save: '保存',
    },
  },
});

export const normalizeI18nStore = (input: unknown): I18nLocaleStore => {
  const localeCandidate = normalizeRecord(input);
  const localeEntries = Object.entries(localeCandidate)
    .map(([locale, namespaces]) => {
      const namespaceCandidate = normalizeRecord(namespaces);
      const namespaceEntries = Object.entries(namespaceCandidate)
        .map(([namespace, translations]) => {
          const translationCandidate = normalizeRecord(translations);
          const normalizedTranslations = Object.fromEntries(
            Object.entries(translationCandidate).map(([key, value]) => [
              key,
              typeof value === 'string' ? value : String(value ?? ''),
            ])
          );
          return [namespace.trim(), normalizedTranslations] as const;
        })
        .filter(([namespace]) => namespace.length > 0);
      return [locale.trim(), Object.fromEntries(namespaceEntries)] as const;
    })
    .filter(([locale]) => locale.length > 0);
  const normalized = Object.fromEntries(localeEntries);
  if (Object.keys(normalized).length > 0) return normalized;
  return createDefaultI18nStore();
};

export const readI18nStore = (projectId?: string): I18nLocaleStore => {
  if (typeof window === 'undefined') return createDefaultI18nStore();
  try {
    const raw = window.localStorage.getItem(getI18nStoreStorageKey(projectId));
    if (!raw) return createDefaultI18nStore();
    return normalizeI18nStore(JSON.parse(raw));
  } catch {
    return createDefaultI18nStore();
  }
};

export const writeI18nStore = (
  projectId: string | undefined,
  store: I18nLocaleStore
) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    getI18nStoreStorageKey(projectId),
    JSON.stringify(normalizeI18nStore(store))
  );
};

export const collectLocaleMissingStats = (
  store: I18nLocaleStore,
  baseLocale: string
): Record<string, number> => {
  const base = store[baseLocale] ?? {};
  const baseKeys = new Set(
    Object.entries(base).flatMap(([namespace, keys]) =>
      Object.keys(keys).map((key) => `${namespace}:${key}`)
    )
  );
  return Object.fromEntries(
    Object.entries(store).map(([locale, namespaces]) => {
      if (locale === baseLocale) return [locale, 0];
      const localeKeySet = new Set(
        Object.entries(namespaces).flatMap(([namespace, keys]) =>
          Object.keys(keys).map((key) => `${namespace}:${key}`)
        )
      );
      const missingCount = [...baseKeys].filter(
        (baseKey) => !localeKeySet.has(baseKey)
      ).length;
      return [locale, missingCount];
    })
  );
};
