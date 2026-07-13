import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useAuthStore } from '@/auth/useAuthStore';
import { useEditorStore } from '@/editor/store/useEditorStore';
import {
  executeWorkspaceCommandOutboxAndAdopt,
  executeWorkspaceVfsOutboxIntent,
} from '@/editor/workspaceSync/workspaceVfsOutboxExecutor';
import { collectLocaleMissingStats, type I18nLocaleStore } from './i18nStore';
import {
  buildNamespaceStats,
  buildTranslationRows,
  getI18nSelectionStorageKey,
  readSelection,
  type I18nSelection,
  type TranslationRow,
} from './i18nResourceModel';
import {
  I18nResourcePreview,
  I18nResourceSidebar,
  I18nResourceTable,
} from './I18nResourcePanels';
import {
  buildI18nResourceValueFromWorkspace,
  getWorkspaceI18nResourceDocument,
  type WorkspaceI18nResourceValue,
} from './workspaceI18nResources';
import {
  createWorkspaceResourceDocumentId,
  createWorkspaceResourceDocumentRequest,
  createWorkspaceResourceValueUpdateCommand,
  RESOURCE_ROOTS,
} from './workspaceResourceDocuments';
import {
  createWorkspaceProjectConfigDocumentContent,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

const EMPTY_WORKSPACE_DOCUMENTS: WorkspaceSnapshot['docsById'] = {};

type I18nResourcePageProps = {
  embedded?: boolean;
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

const createInitialSelection = (
  projectId: string | undefined,
  initialStore: I18nLocaleStore
): I18nSelection => {
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
};

export function I18nResourcePage({ embedded = false }: I18nResourcePageProps) {
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const token = useAuthStore((state) => state.token);
  const workspace = useEditorStore((state) => state.workspace);
  const workspaceId = workspace?.id;
  const workspaceRev = workspace?.workspaceRev;
  const workspaceDocumentsById =
    workspace?.docsById ?? EMPTY_WORKSPACE_DOCUMENTS;
  const resourceValue = useMemo(
    () => buildI18nResourceValueFromWorkspace(workspaceDocumentsById),
    [workspaceDocumentsById]
  );
  const store = resourceValue.store;
  const reviewedMap = resourceValue.reviewedMap;
  const [searchKeyword, setSearchKeyword] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [newLocale, setNewLocale] = useState('');
  const [newNamespace, setNewNamespace] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newSourceValue, setNewSourceValue] = useState('');
  const [selection, setSelection] = useState<I18nSelection>(() =>
    createInitialSelection(projectId, resourceValue.store)
  );
  const fileInputId = 'resource-i18n-import-json';

  const locales = useMemo(() => Object.keys(store), [store]);
  const sourceNamespaces = useMemo(
    () => Object.keys(store[selection.sourceLocale] ?? {}),
    [selection.sourceLocale, store]
  );
  const sourceNamespaceMap = store[selection.sourceLocale] ?? {};
  const targetNamespaceMap = store[selection.targetLocale] ?? {};
  const missingStats = useMemo(
    () => collectLocaleMissingStats(store, selection.sourceLocale),
    [selection.sourceLocale, store]
  );
  const namespaceStats = useMemo(
    () =>
      buildNamespaceStats({
        sourceNamespaces,
        sourceNamespaceMap,
        targetNamespaceMap,
      }),
    [sourceNamespaceMap, sourceNamespaces, targetNamespaceMap]
  );
  const rows = useMemo<TranslationRow[]>(
    () =>
      buildTranslationRows({
        locales,
        store,
        selection,
        reviewedMap,
        searchKeyword,
        missingOnly,
        reviewOnly,
      }),
    [
      locales,
      missingOnly,
      reviewOnly,
      reviewedMap,
      searchKeyword,
      selection,
      store,
    ]
  );
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
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      getI18nSelectionStorageKey(projectId),
      JSON.stringify(selection)
    );
  }, [projectId, selection]);

  const persistI18nResourceValue = async (
    value: WorkspaceI18nResourceValue
  ) => {
    if (!token || !workspace || !workspaceId || !workspaceRev) return;
    const existing = getWorkspaceI18nResourceDocument(workspaceDocumentsById);
    if (existing) {
      const command = createWorkspaceResourceValueUpdateCommand({
        workspaceId,
        document: existing,
        value,
        label: 'Update i18n resources',
      });
      if (!command) return;
      const outcome = await executeWorkspaceCommandOutboxAndAdopt({
        token,
        workspace,
        command,
      });
      if (outcome.status === 'rejected') throw new Error(outcome.message);
      return;
    }
    const outcome = await executeWorkspaceVfsOutboxIntent({
      token,
      workspace,
      request: createWorkspaceResourceDocumentRequest({
        workspaceRev,
        documentId: createWorkspaceResourceDocumentId(
          'i18n_config',
          RESOURCE_ROOTS.i18n
        ),
        path: RESOURCE_ROOTS.i18n,
        type: 'project-config',
        content: createWorkspaceProjectConfigDocumentContent(value),
      }),
    });
    if (outcome.status === 'rejected') throw new Error(outcome.message);
  };

  const updateI18nResourceValue = (
    updater: (current: WorkspaceI18nResourceValue) => WorkspaceI18nResourceValue
  ) => {
    void persistI18nResourceValue(updater(resourceValue));
  };

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

  const selectNamespace = (namespace: string) => {
    setSelection((current) => ({
      ...current,
      namespace,
    }));
  };

  const selectKey = (key: string) => {
    setSelection((current) => ({
      ...current,
      key,
    }));
  };

  const updateLocaleValue = (locale: string, key: string, value: string) => {
    updateI18nResourceValue((current) => ({
      ...current,
      store: {
        ...current.store,
        [locale]: {
          ...(current.store[locale] ?? {}),
          [selection.namespace]: {
            ...(current.store[locale]?.[selection.namespace] ?? {}),
            [key]: value,
          },
        },
      },
    }));
  };

  const toggleReviewed = (row: TranslationRow) => {
    updateI18nResourceValue((current) => ({
      ...current,
      reviewedMap: {
        ...current.reviewedMap,
        [row.id]: !current.reviewedMap[row.id],
      },
    }));
  };

  const addLocale = () => {
    const locale = newLocale.trim();
    if (!locale || store[locale]) return;
    updateI18nResourceValue((current) => ({
      ...current,
      store: {
        ...current.store,
        [locale]: { common: {} },
      },
    }));
    setSelection((current) => ({ ...current, targetLocale: locale }));
    setNewLocale('');
  };

  const addNamespace = () => {
    const namespace = newNamespace.trim();
    if (!namespace) return;
    updateI18nResourceValue((current) => ({
      ...current,
      store: {
        ...current.store,
        [selection.sourceLocale]: {
          ...(current.store[selection.sourceLocale] ?? {}),
          [namespace]: {},
        },
        [selection.targetLocale]: {
          ...(current.store[selection.targetLocale] ?? {}),
          [namespace]: {},
        },
      },
    }));
    setSelection((current) => ({ ...current, namespace }));
    setNewNamespace('');
  };

  const addKey = () => {
    const key = newKey.trim();
    if (!key) return;
    updateI18nResourceValue((current) => {
      const next: I18nLocaleStore = { ...current.store };
      locales.forEach((locale) => {
        next[locale] = {
          ...(current.store[locale] ?? {}),
          [selection.namespace]: {
            ...(current.store[locale]?.[selection.namespace] ?? {}),
            [key]: locale === selection.sourceLocale ? newSourceValue : '',
          },
        };
      });
      return { ...current, store: next };
    });
    setSelection((current) => ({ ...current, key }));
    setNewKey('');
    setNewSourceValue('');
  };

  const deleteKey = (key: string) => {
    updateI18nResourceValue((current) => {
      const next: I18nLocaleStore = { ...current.store };
      locales.forEach((locale) => {
        const currentNamespace =
          current.store[locale]?.[selection.namespace] ?? {};
        const nextNamespace = { ...currentNamespace };
        delete nextNamespace[key];
        next[locale] = {
          ...(current.store[locale] ?? {}),
          [selection.namespace]: nextNamespace,
        };
      });
      return {
        ...current,
        store: next,
        reviewedMap: Object.fromEntries(
          Object.entries(current.reviewedMap).filter(
            ([reviewKey]) =>
              !reviewKey.endsWith(`::${selection.namespace}::${key}`)
          )
        ),
      };
    });
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

  const importLocale = async (file: File) => {
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
      updateI18nResourceValue((current) => ({
        ...current,
        store: {
          ...current.store,
          [selection.targetLocale]: Object.fromEntries(
            Object.entries(parsed).map(([namespace, values]) => [
              namespace,
              Object.fromEntries(
                Object.entries(values).map(([key, value]) => [
                  key,
                  typeof value === 'string' ? value : String(value ?? ''),
                ])
              ),
            ])
          ),
        },
      }));
    } catch {
      // ignore invalid json import
    }
  };

  const shellClassName = embedded
    ? 'grid gap-4'
    : 'mx-auto grid w-full max-w-[1480px] gap-4 px-6 py-6';

  return (
    <section className={shellClassName}>
      <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
        <h2 className="text-base font-medium text-(--text-primary)">
          {t('resourceManager.i18n.header.title')}
        </h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          {t('resourceManager.i18n.header.description')}
        </p>
      </article>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <I18nResourceSidebar
          t={t}
          searchKeyword={searchKeyword}
          missingOnly={missingOnly}
          reviewOnly={reviewOnly}
          namespaceStats={namespaceStats}
          selectedNamespace={selection.namespace}
          currentNamespaceStats={currentNamespaceStats}
          progressRate={currentNamespaceStats?.completionRate ?? 100}
          missingCount={missingStats[selection.targetLocale] ?? 0}
          newLocale={newLocale}
          newNamespace={newNamespace}
          onSearchKeywordChange={setSearchKeyword}
          onMissingOnlyChange={setMissingOnly}
          onReviewOnlyChange={setReviewOnly}
          onSelectNamespace={selectNamespace}
          onNewLocaleChange={setNewLocale}
          onNewNamespaceChange={setNewNamespace}
          onAddLocale={addLocale}
          onAddNamespace={addNamespace}
        />

        <I18nResourceTable
          t={t}
          fileInputId={fileInputId}
          locales={locales}
          rows={rows}
          selectedNamespace={selection.namespace}
          sourceLocale={selection.sourceLocale}
          selectedKey={selection.key}
          newKey={newKey}
          newSourceValue={newSourceValue}
          onImport={importLocale}
          onExport={exportLocale}
          onDeleteKey={deleteKey}
          onSelectKey={selectKey}
          onUpdateLocaleValue={updateLocaleValue}
          onToggleReviewed={toggleReviewed}
          onNewKeyChange={setNewKey}
          onNewSourceValueChange={setNewSourceValue}
          onAddKey={addKey}
        />

        <I18nResourcePreview
          t={t}
          selectedRow={selectedRow}
          highlightVariables={highlightVariables}
        />
      </div>
    </section>
  );
}
