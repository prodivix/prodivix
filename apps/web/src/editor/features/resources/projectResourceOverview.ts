import type { ComponentType } from 'react';
import {
  FileArchive,
  FileCog,
  Globe2,
  FileCode2,
  LayoutDashboard,
  Library,
  Boxes,
  Palette,
  ShieldCheck,
} from 'lucide-react';
import {
  decodeDtcgDesignTokenDocument,
  decodeDtcgDesignTokenResolverDocument,
} from '@prodivix/tokens';
import { collectBestPracticeHints, flattenPublicFiles } from './publicTree';
import { collectLocaleMissingStats } from './i18nStore';
import { flattenEnabledProjectFiles } from './projectFileStore';
import type { WorkspaceDocument, WorkspaceVfsNode } from '@prodivix/workspace';
import {
  buildCodeResourceFilesFromWorkspaceDocuments,
  buildCodeResourceTreeFromWorkspaceVfs,
} from '@/editor/features/code/workspaceCodeArtifacts';
import { buildPublicResourceTreeFromWorkspace } from './workspacePublicResources';
import { buildProjectFilesFromWorkspace } from './workspaceProjectFiles';
import { buildI18nResourceValueFromWorkspace } from './workspaceI18nResources';
import { buildExternalLibrariesValueFromWorkspace } from './workspaceExternalLibraries';

export type SectionId =
  | 'overview'
  | 'components'
  | 'tokens'
  | 'auth'
  | 'public'
  | 'code'
  | 'i18n'
  | 'external'
  | 'projectFiles';

export type SectionMeta = {
  id: SectionId;
  icon: ComponentType<{ size?: number }>;
};

export const sectionMetas: SectionMeta[] = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'components', icon: Boxes },
  { id: 'tokens', icon: Palette },
  { id: 'auth', icon: ShieldCheck },
  { id: 'public', icon: FileArchive },
  { id: 'code', icon: FileCode2 },
  { id: 'i18n', icon: Globe2 },
  { id: 'external', icon: Library },
  { id: 'projectFiles', icon: FileCog },
];

export const getResourceManagerViewStorageKey = (projectId?: string) =>
  `prodivix.resourceManager.view.${projectId?.trim() || 'default'}`;

export const resolveLatestUpdatedAt = (values: Array<string | undefined>) => {
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

export const formatUpdatedAt = (value: string | null) => {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 16);
};

export type OverviewSnapshot = {
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
  tokens: {
    documents: number;
    resolvers: number;
    tokens: number;
    contexts: number;
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

export const buildOverviewSnapshot = (
  projectId?: string,
  workspaceDocumentsById: Record<string, WorkspaceDocument> = {},
  treeRootId?: string,
  treeById: Record<string, WorkspaceVfsNode> = {}
): OverviewSnapshot => {
  void projectId;
  const publicTree = buildPublicResourceTreeFromWorkspace(
    workspaceDocumentsById,
    treeRootId,
    treeById
  );
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

  const codeTree = buildCodeResourceTreeFromWorkspaceVfs(
    workspaceDocumentsById,
    treeRootId,
    treeById
  );
  const codeFiles = buildCodeResourceFilesFromWorkspaceDocuments(
    workspaceDocumentsById,
    treeRootId,
    treeById
  );
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

  const designTokenDocuments = Object.values(workspaceDocumentsById).filter(
    (document) => document.type === 'design-tokens'
  );
  const resolverDocuments = Object.values(workspaceDocumentsById).filter(
    (document) => document.type === 'design-token-resolver'
  );
  const designTokenCount = designTokenDocuments.reduce((count, document) => {
    const decoded = decodeDtcgDesignTokenDocument(document.content);
    return count + (decoded.ok ? decoded.value.tokens.length : 0);
  }, 0);
  const designTokenContextCount = resolverDocuments.reduce(
    (count, document) => {
      const decoded = decodeDtcgDesignTokenResolverDocument(document.content);
      return (
        count +
        (decoded.ok
          ? decoded.value.modifiers.reduce(
              (modifierCount, modifier) =>
                modifierCount + modifier.contexts.length,
              0
            )
          : 0)
      );
    },
    0
  );

  const i18nStore = buildI18nResourceValueFromWorkspace(
    workspaceDocumentsById
  ).store;
  const i18nLocales = Object.keys(i18nStore);
  const baseLocale = i18nStore.en ? 'en' : (i18nLocales[0] ?? 'en');
  const namespaceSet = new Set<string>();
  const keySet = new Set<string>();

  Object.entries(i18nStore).forEach(([, namespaces]) => {
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

  const externalLibraries = buildExternalLibrariesValueFromWorkspace(
    workspaceDocumentsById
  );
  const projectFiles = buildProjectFilesFromWorkspace(workspaceDocumentsById);
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
    tokens: {
      documents: designTokenDocuments.length,
      resolvers: resolverDocuments.length,
      tokens: designTokenCount,
      contexts: designTokenContextCount,
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
      componentLibraries: externalLibraries.componentLibraryIds.length,
      iconLibraries: externalLibraries.iconLibraryIds.length,
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
