import { type ComponentType, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  FileArchive,
  FileCode2,
  FileCog,
  Globe2,
  LayoutDashboard,
  Library,
  Plus,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { CodeResourcePage } from './CodeResourcePage';
import { ExternalLibraryManager } from './ExternalLibraryManager';
import { I18nResourcePage } from './I18nResourcePage';
import { ProjectFileManager } from './ProjectFileManager';
import { PublicResourcePage } from './PublicResourcePage';
import {
  collectBestPracticeHints,
  flattenPublicFiles,
  readPublicTree,
} from './publicTree';
import {
  createCodeFile,
  flattenCodeFiles,
  findCodeNodeById,
  readCodeTree,
  writeCodeTree,
  type CodeResourceNode,
} from './codeTree';
import { collectLocaleMissingStats, readI18nStore } from './i18nStore';
import {
  flattenEnabledProjectFiles,
  readProjectFiles,
} from './projectFileStore';

type SectionId =
  | 'overview'
  | 'public'
  | 'code'
  | 'i18n'
  | 'external'
  | 'projectFiles';

type SectionMeta = {
  id: SectionId;
  icon: ComponentType<{ size?: number }>;
};

const sectionMetas: SectionMeta[] = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'public', icon: FileArchive },
  { id: 'code', icon: FileCode2 },
  { id: 'i18n', icon: Globe2 },
  { id: 'external', icon: Library },
  { id: 'projectFiles', icon: FileCog },
];

const getResourceManagerViewStorageKey = (projectId?: string) =>
  `prodivix.resourceManager.view.${projectId?.trim() || 'default'}`;

const getResourceManagerCodeSelectionStorageKey = (projectId?: string) =>
  `prodivix.resourceManager.code.selection.${projectId?.trim() || 'default'}`;

const getResourceManagerExternalSelectionStorageKey = (projectId?: string) =>
  `prodivix.resourceManager.external.selection.${projectId?.trim() || 'default'}`;

const getResourceManagerIconSelectionStorageKey = (projectId?: string) =>
  `prodivix.resourceManager.icon.selection.${projectId?.trim() || 'default'}`;

const parseStoredStringArray = (raw: string | null) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
};

const resolveLatestUpdatedAt = (values: Array<string | undefined>) => {
  let latest: string | null = null;
  let latestTime = 0;
  values.forEach((value) => {
    if (!value) return;
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return;
    if (time > latestTime) {
      latestTime = time;
      latest = value;
    }
  });
  return latest;
};

const formatUpdatedAt = (value: string | null) => {
  if (!value) return '—';
  return value.replace('T', ' ').slice(0, 16);
};

type OverviewSnapshot = {
  public: {
    files: number;
    warnings: number;
    infos: number;
    updatedAt: string | null;
  };
  code: {
    files: number;
    scripts: number;
    styles: number;
    shaders: number;
    updatedAt: string | null;
  };
  i18n: {
    locales: number;
    namespaces: number;
    keys: number;
    missingValues: number;
    baseLocale: string;
    worstLocale: { locale: string; missing: number } | null;
  };
  external: {
    componentLibraries: number;
    iconLibraries: number;
  };
  projectFiles: {
    files: number;
    enabled: number;
    updatedAt: string | null;
    hasLicense: boolean;
  };
};

const buildOverviewSnapshot = (projectId?: string): OverviewSnapshot => {
  const publicTree = readPublicTree(projectId);
  const publicFiles = flattenPublicFiles(publicTree);
  const publicHints = publicFiles.reduce(
    (acc, file) => {
      const hints = collectBestPracticeHints(file);
      acc.warnings += hints.filter((hint) => hint.level === 'warning').length;
      acc.infos += hints.filter((hint) => hint.level === 'info').length;
      return acc;
    },
    { warnings: 0, infos: 0 }
  );

  const codeTree = readCodeTree(projectId);
  const codeFiles = flattenCodeFiles(codeTree);
  const codeCounts = codeFiles.reduce(
    (acc, file) => {
      const segment = file.path.split('/')[1] ?? '';
      if (segment === 'scripts') acc.scripts += 1;
      if (segment === 'styles') acc.styles += 1;
      if (segment === 'shaders') acc.shaders += 1;
      return acc;
    },
    { scripts: 0, styles: 0, shaders: 0 }
  );

  const i18nStore = readI18nStore(projectId);
  const i18nLocales = Object.keys(i18nStore);
  const baseLocale = i18nStore.en ? 'en' : (i18nLocales[0] ?? 'en');
  const namespaceSet = new Set<string>();
  const keySet = new Set<string>();
  const namespacesByLocale: Array<
    [string, Record<string, Record<string, string>>]
  > = Object.entries(i18nStore);

  namespacesByLocale.forEach(([, namespaces]) => {
    Object.entries(namespaces).forEach(([namespace, translations]) => {
      namespaceSet.add(namespace);
      Object.keys(translations).forEach((key) =>
        keySet.add(`${namespace}::${key}`)
      );
    });
  });

  let missingValues = 0;
  keySet.forEach((serializedKey) => {
    const [namespace, key] = serializedKey.split('::');
    i18nLocales.forEach((locale) => {
      const value = i18nStore[locale]?.[namespace]?.[key];
      if (!String(value ?? '').trim()) missingValues += 1;
    });
  });

  const missingKeyStats = collectLocaleMissingStats(i18nStore, baseLocale);
  const worstLocale = Object.entries(missingKeyStats)
    .filter(([locale]) => locale !== baseLocale)
    .reduce<{ locale: string; missing: number } | null>(
      (acc, [locale, count]) => {
        if (!acc || count > acc.missing) return { locale, missing: count };
        return acc;
      },
      null
    );

  const externalComponentIds = parseStoredStringArray(
    typeof window === 'undefined'
      ? null
      : window.localStorage.getItem(
          getResourceManagerExternalSelectionStorageKey(projectId)
        )
  );
  const externalIconIds = parseStoredStringArray(
    typeof window === 'undefined'
      ? null
      : window.localStorage.getItem(
          getResourceManagerIconSelectionStorageKey(projectId)
        )
  );
  const projectFiles = readProjectFiles(projectId);
  const enabledProjectFiles = flattenEnabledProjectFiles(projectFiles);

  return {
    public: {
      files: publicFiles.length,
      warnings: publicHints.warnings,
      infos: publicHints.infos,
      updatedAt: resolveLatestUpdatedAt([
        publicTree.updatedAt,
        ...publicFiles.map((file) => file.updatedAt),
      ]),
    },
    code: {
      files: codeFiles.length,
      scripts: codeCounts.scripts,
      styles: codeCounts.styles,
      shaders: codeCounts.shaders,
      updatedAt: resolveLatestUpdatedAt([
        codeTree.updatedAt,
        ...codeFiles.map((file) => file.updatedAt),
      ]),
    },
    i18n: {
      locales: i18nLocales.length,
      namespaces: namespaceSet.size,
      keys: keySet.size,
      missingValues,
      baseLocale,
      worstLocale,
    },
    external: {
      componentLibraries: externalComponentIds.length,
      iconLibraries: externalIconIds.length,
    },
    projectFiles: {
      files: projectFiles.length,
      enabled: enabledProjectFiles.length,
      updatedAt: resolveLatestUpdatedAt(
        projectFiles.map((file) => file.updatedAt)
      ),
      hasLicense: enabledProjectFiles.some((file) => file.path === 'LICENSE'),
    },
  };
};

const collectNodeIds = (node: CodeResourceNode) => {
  const ids = new Set<string>();
  const walk = (current: CodeResourceNode) => {
    ids.add(current.id);
    (current.children ?? []).forEach(walk);
  };
  walk(node);
  return ids;
};

const resolveCreatedNodeId = (
  before: CodeResourceNode,
  after: CodeResourceNode
) => {
  const beforeIds = collectNodeIds(before);
  let createdId: string | null = null;
  const walk = (current: CodeResourceNode) => {
    if (createdId) return;
    if (!beforeIds.has(current.id)) {
      createdId = current.id;
      return;
    }
    (current.children ?? []).forEach(walk);
  };
  walk(after);
  return createdId;
};

const createTemplateForCodeFolder = (
  folder: 'scripts' | 'styles' | 'shaders'
) => {
  if (folder === 'styles') {
    return {
      name: 'untitled.css',
      mime: 'text/css',
      content: '.className {\n  display: block;\n}\n',
    };
  }
  if (folder === 'shaders') {
    return {
      name: 'untitled.glsl',
      mime: 'text/glsl',
      content: 'void main() {\n  gl_Position = vec4(0.0);\n}\n',
    };
  }
  return {
    name: 'untitled.ts',
    mime: 'text/typescript',
    content: 'export const hello = "prodivix";\n',
  };
};

const ResourceTile = ({
  icon: Icon,
  title,
  description,
  metrics,
  status,
  actionLabel,
  onAction,
}: {
  icon: ComponentType<{ size?: number }>;
  title: string;
  description: string;
  metrics: Array<{ label: string; value: string }>;
  status: 'default' | 'warning';
  actionLabel: string;
  onAction: () => void;
}) => {
  const { t } = useTranslation('editor');

  return (
    <article className="relative overflow-hidden rounded-2xl border border-black/8 bg-(--bg-canvas) p-5 shadow-[0_10px_28px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-(--text-muted) uppercase">
            <Icon size={14} />
            {title}
          </p>
          <p className="mt-2 text-sm text-(--text-secondary)">{description}</p>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-(--text-secondary) hover:border-black/20 hover:bg-black/[0.02]"
          onClick={onAction}
        >
          {actionLabel}
          <ArrowRight size={12} />
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div
            key={`${title}-${metric.label}`}
            className="rounded-xl border border-black/8 bg-black/[0.015] px-3 py-2"
          >
            <p className="text-[11px] tracking-[0.08em] text-(--text-muted) uppercase">
              {metric.label}
            </p>
            <p className="mt-1 text-sm font-semibold text-(--text-primary)">
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 text-xs text-(--text-secondary)">
        <span className="inline-flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
          />
          {status === 'warning'
            ? t('resourceManager.overview.tile.needsAttention')
            : t('resourceManager.overview.tile.lookingGood')}
        </span>
        <span className="text-(--text-muted)">
          {t('resourceManager.overview.tile.overview')}
        </span>
      </div>
    </article>
  );
};

export function ProjectResources() {
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const [activeSection, setActiveSection] = useState<SectionId>(() => {
    if (typeof window === 'undefined') return 'overview';
    const raw = window.localStorage.getItem(
      getResourceManagerViewStorageKey(projectId)
    );
    if (
      raw === 'overview' ||
      raw === 'public' ||
      raw === 'code' ||
      raw === 'i18n' ||
      raw === 'external' ||
      raw === 'projectFiles'
    ) {
      return raw;
    }
    return 'overview';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      getResourceManagerViewStorageKey(projectId),
      activeSection
    );
  }, [activeSection, projectId]);

  const overviewSnapshot = useMemo(() => {
    if (activeSection !== 'overview') return null;
    return buildOverviewSnapshot(projectId);
  }, [activeSection, projectId]);

  const createCodeAssetAndOpen = (folder: 'scripts' | 'styles' | 'shaders') => {
    if (typeof window === 'undefined') return;
    const currentTree = readCodeTree(projectId);
    const template = createTemplateForCodeFolder(folder);
    const parentId =
      folder === 'scripts'
        ? 'code-scripts'
        : folder === 'styles'
          ? 'code-styles'
          : 'code-shaders';
    const resolvedParentId =
      findCodeNodeById(currentTree, parentId)?.type === 'folder'
        ? parentId
        : currentTree.id;
    const contentRef = `data:${template.mime};charset=utf-8,${encodeURIComponent(template.content)}`;
    const size = new TextEncoder().encode(template.content).length;
    const nextTree = createCodeFile(currentTree, resolvedParentId, {
      name: template.name,
      mime: template.mime,
      size,
      textContent: template.content,
      contentRef,
      category: 'document',
    });
    writeCodeTree(projectId, nextTree);
    const createdNodeId = resolveCreatedNodeId(currentTree, nextTree);
    if (createdNodeId) {
      window.localStorage.setItem(
        getResourceManagerCodeSelectionStorageKey(projectId),
        createdNodeId
      );
    }
    setActiveSection('code');
  };

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
      <header className="rounded-2xl border border-black/8 bg-white/92 p-5 shadow-[0_10px_28px_rgba(0,0,0,0.06)]">
        <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-(--text-muted) uppercase">
          {t('resourceManager.header.badge')}
        </p>
        <h1 className="text-2xl font-semibold text-(--text-primary)">
          {t('resourceManager.header.title')}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-(--text-secondary)">
          {t('resourceManager.header.description')}
        </p>
      </header>

      <nav className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-2">
        <div className="flex flex-wrap gap-2">
          {sectionMetas.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'border border-black/16 bg-black text-white'
                    : 'border border-transparent bg-transparent text-(--text-secondary) hover:border-black/10 hover:text-(--text-primary)'
                }`}
              >
                <Icon size={14} />
                {t(`resourceManager.tabs.${section.id}`)}
              </button>
            );
          })}
        </div>
      </nav>

      {activeSection === 'overview' ? (
        <div className="grid gap-4">
          {overviewSnapshot ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <ResourceTile
                icon={FileArchive}
                title={t('resourceManager.tabs.public')}
                description={t(
                  'resourceManager.overview.cards.public.description'
                )}
                metrics={[
                  {
                    label: t('resourceManager.overview.metrics.files'),
                    value: String(overviewSnapshot.public.files),
                  },
                  {
                    label: t('resourceManager.overview.metrics.warnings'),
                    value: String(overviewSnapshot.public.warnings),
                  },
                  {
                    label: t('resourceManager.overview.metrics.updated'),
                    value: formatUpdatedAt(overviewSnapshot.public.updatedAt),
                  },
                ]}
                status={
                  overviewSnapshot.public.warnings > 0 ? 'warning' : 'default'
                }
                actionLabel={t('resourceManager.overview.actions.open')}
                onAction={() => setActiveSection('public')}
              />
              <ResourceTile
                icon={FileCode2}
                title={t('resourceManager.tabs.code')}
                description={t(
                  'resourceManager.overview.cards.code.description'
                )}
                metrics={[
                  {
                    label: t('resourceManager.overview.metrics.files'),
                    value: String(overviewSnapshot.code.files),
                  },
                  {
                    label: t('resourceManager.overview.metrics.scriptsStyles'),
                    value: `${overviewSnapshot.code.scripts}/${overviewSnapshot.code.styles}`,
                  },
                  {
                    label: t('resourceManager.overview.metrics.updated'),
                    value: formatUpdatedAt(overviewSnapshot.code.updatedAt),
                  },
                ]}
                status={
                  overviewSnapshot.code.files === 0 ? 'warning' : 'default'
                }
                actionLabel={t('resourceManager.overview.actions.open')}
                onAction={() => setActiveSection('code')}
              />
              <ResourceTile
                icon={Globe2}
                title={t('resourceManager.tabs.i18n')}
                description={t(
                  'resourceManager.overview.cards.i18n.description'
                )}
                metrics={[
                  {
                    label: t('resourceManager.overview.metrics.locales'),
                    value: String(overviewSnapshot.i18n.locales),
                  },
                  {
                    label: t('resourceManager.overview.metrics.namespaces'),
                    value: String(overviewSnapshot.i18n.namespaces),
                  },
                  {
                    label: t('resourceManager.overview.metrics.missingValues'),
                    value: String(overviewSnapshot.i18n.missingValues),
                  },
                ]}
                status={
                  overviewSnapshot.i18n.missingValues > 0
                    ? 'warning'
                    : 'default'
                }
                actionLabel={t('resourceManager.overview.actions.open')}
                onAction={() => setActiveSection('i18n')}
              />
              <ResourceTile
                icon={Library}
                title={t('resourceManager.tabs.external')}
                description={t(
                  'resourceManager.overview.cards.external.description'
                )}
                metrics={[
                  {
                    label: t('resourceManager.overview.metrics.components'),
                    value: String(overviewSnapshot.external.componentLibraries),
                  },
                  {
                    label: t('resourceManager.overview.metrics.icons'),
                    value: String(overviewSnapshot.external.iconLibraries),
                  },
                  {
                    label: t('resourceManager.overview.metrics.status'),
                    value:
                      overviewSnapshot.external.componentLibraries +
                        overviewSnapshot.external.iconLibraries >
                      0
                        ? t('resourceManager.overview.metrics.configured')
                        : t('resourceManager.overview.metrics.none'),
                  },
                ]}
                status={
                  overviewSnapshot.external.componentLibraries +
                    overviewSnapshot.external.iconLibraries ===
                  0
                    ? 'warning'
                    : 'default'
                }
                actionLabel={t('resourceManager.overview.actions.open')}
                onAction={() => setActiveSection('external')}
              />
              <ResourceTile
                icon={FileCog}
                title={t('resourceManager.tabs.projectFiles')}
                description={t(
                  'resourceManager.overview.cards.projectFiles.description'
                )}
                metrics={[
                  {
                    label: t('resourceManager.overview.metrics.files'),
                    value: String(overviewSnapshot.projectFiles.files),
                  },
                  {
                    label: t('resourceManager.overview.metrics.included'),
                    value: String(overviewSnapshot.projectFiles.enabled),
                  },
                  {
                    label: t('resourceManager.overview.metrics.updated'),
                    value: formatUpdatedAt(
                      overviewSnapshot.projectFiles.updatedAt
                    ),
                  },
                ]}
                status={
                  overviewSnapshot.projectFiles.hasLicense
                    ? 'default'
                    : 'warning'
                }
                actionLabel={t('resourceManager.overview.actions.open')}
                onAction={() => setActiveSection('projectFiles')}
              />
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
            <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.12em] text-(--text-muted) uppercase">
                    {t('resourceManager.overview.quickActions.badgeTitle')}
                  </p>
                  <h2 className="mt-2 text-base font-semibold text-(--text-primary)">
                    {t('resourceManager.overview.quickActions.title')}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-(--text-secondary)">
                    {t('resourceManager.overview.quickActions.description')}
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-2xl border border-black/8 bg-black/[0.015] px-3 py-2 text-xs text-(--text-secondary)">
                  <Sparkles size={14} className="text-(--text-secondary)" />
                  {t('resourceManager.overview.quickActions.badge')}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <button
                  type="button"
                  className="group grid gap-1 rounded-2xl border border-black/8 bg-white p-4 text-left hover:border-black/16 hover:bg-black/[0.01]"
                  onClick={() => createCodeAssetAndOpen('scripts')}
                >
                  <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-(--text-muted) uppercase">
                    <Plus size={14} />
                    {t('resourceManager.overview.quickActions.newScript')}
                  </p>
                  <p className="text-sm font-semibold text-(--text-primary)">
                    {t('resourceManager.overview.quickActions.scriptPath')}
                  </p>
                  <p className="text-xs text-(--text-secondary)">
                    {t('resourceManager.overview.quickActions.scriptHint')}
                  </p>
                </button>

                <button
                  type="button"
                  className="group grid gap-1 rounded-2xl border border-black/8 bg-white p-4 text-left hover:border-black/16 hover:bg-black/[0.01]"
                  onClick={() => createCodeAssetAndOpen('styles')}
                >
                  <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-(--text-muted) uppercase">
                    <Plus size={14} />
                    {t('resourceManager.overview.quickActions.newStyle')}
                  </p>
                  <p className="text-sm font-semibold text-(--text-primary)">
                    {t('resourceManager.overview.quickActions.stylePath')}
                  </p>
                  <p className="text-xs text-(--text-secondary)">
                    {t('resourceManager.overview.quickActions.styleHint')}
                  </p>
                </button>

                <button
                  type="button"
                  className="group grid gap-1 rounded-2xl border border-black/8 bg-white p-4 text-left hover:border-black/16 hover:bg-black/[0.01]"
                  onClick={() => createCodeAssetAndOpen('shaders')}
                >
                  <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-(--text-muted) uppercase">
                    <Plus size={14} />
                    {t('resourceManager.overview.quickActions.newShader')}
                  </p>
                  <p className="text-sm font-semibold text-(--text-primary)">
                    {t('resourceManager.overview.quickActions.shaderPath')}
                  </p>
                  <p className="text-xs text-(--text-secondary)">
                    {t('resourceManager.overview.quickActions.shaderHint')}
                  </p>
                </button>
              </div>
            </article>

            <article className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
              <p className="text-xs font-semibold tracking-[0.12em] text-(--text-muted) uppercase">
                {t('resourceManager.overview.healthCheck.badge')}
              </p>
              <h2 className="mt-2 text-base font-semibold text-(--text-primary)">
                {t('resourceManager.overview.healthCheck.title')}
              </h2>
              <div className="mt-4 grid gap-2 text-sm text-(--text-secondary)">
                {overviewSnapshot?.public.warnings ? (
                  <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
                    <TriangleAlert
                      size={16}
                      className="mt-0.5 text-amber-700"
                    />
                    <div>
                      {t(
                        'resourceManager.overview.healthCheck.publicWarnings',
                        {
                          count: overviewSnapshot.public.warnings,
                        }
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-black/8 bg-black/[0.015] px-3 py-2 text-xs">
                    {t('resourceManager.overview.healthCheck.publicClean')}
                  </div>
                )}

                {overviewSnapshot?.i18n.missingValues ? (
                  <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
                    <TriangleAlert
                      size={16}
                      className="mt-0.5 text-amber-700"
                    />
                    <div>
                      {t('resourceManager.overview.healthCheck.i18nMissing', {
                        count: overviewSnapshot.i18n.missingValues,
                        baseLocale: overviewSnapshot.i18n.baseLocale,
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-black/8 bg-black/[0.015] px-3 py-2 text-xs">
                    {t('resourceManager.overview.healthCheck.i18nGood')}
                  </div>
                )}

                {overviewSnapshot?.external.componentLibraries === 0 ? (
                  <div className="rounded-2xl border border-black/8 bg-black/[0.015] px-3 py-2 text-xs">
                    {t('resourceManager.overview.healthCheck.noComponentLib')}
                  </div>
                ) : null}

                {overviewSnapshot?.i18n.worstLocale ? (
                  <div className="rounded-2xl border border-black/8 bg-black/[0.015] px-3 py-2 text-xs">
                    {t('resourceManager.overview.healthCheck.worstLocale', {
                      locale: overviewSnapshot.i18n.worstLocale.locale,
                      count: overviewSnapshot.i18n.worstLocale.missing,
                    })}
                  </div>
                ) : null}
              </div>
            </article>
          </div>
        </div>
      ) : null}

      {activeSection === 'public' ? <PublicResourcePage embedded /> : null}

      {activeSection === 'code' ? <CodeResourcePage embedded /> : null}

      {activeSection === 'i18n' ? <I18nResourcePage embedded /> : null}

      {activeSection === 'external' ? (
        <ExternalLibraryManager projectId={projectId} />
      ) : null}

      {activeSection === 'projectFiles' ? (
        <ProjectFileManager embedded />
      ) : null}
    </section>
  );
}
