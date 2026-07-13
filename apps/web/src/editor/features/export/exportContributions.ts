import {
  completeExportDependencyOrigin,
  createRouteExportContribution,
  createStaticDeploymentExportContribution,
  resolveWorkspaceDocumentExportSource,
  type ExportArtifactContribution,
  type ExportDependency,
  type ExportFileKind,
  type ExportFileImportMode,
  type ExportProgramContribution,
  type ExportSourceTrace,
  type ReactGeneratorCodeArtifact,
} from '@prodivix/prodivix-compiler';
import type { WorkspaceRouteManifest } from '@prodivix/router';
import type { WorkspaceDocument } from '@prodivix/workspace';
import type { ProjectFile } from '@/editor/features/resources/projectFileStore';
import type { PublicResourceNode } from '@/editor/features/resources/publicTree';
import { LIBRARY_CATALOG } from '@/editor/features/resources/externalLibraryManager/libraryCatalog';
import { getBundledOfficialPlugin } from '@/plugins/platform/bundledOfficialPlugins';
import {
  buildExternalLibrariesValueFromWorkspace,
  getWorkspaceExternalLibrariesDocument,
} from '@/editor/features/resources/workspaceExternalLibraries';
import {
  buildI18nResourceValueFromWorkspace,
  getWorkspaceI18nResourceDocument,
} from '@/editor/features/resources/workspaceI18nResources';
import { decodeDataUrlToBytes } from './exportBinary';

type PublicExportFile = PublicResourceNode & { path: string };
type WorkspaceDocumentsById = Record<string, WorkspaceDocument>;

const projectFileKindByKind: Record<ProjectFile['kind'], ExportFileKind> = {
  gitignore: 'config',
  license: 'documentation',
  readme: 'documentation',
  env: 'config',
};

const getProjectArtifactKind = (
  file: ProjectFile
): ExportArtifactContribution['kind'] => {
  const fileKind = projectFileKindByKind[file.kind] ?? 'config';
  if (fileKind === 'documentation') return 'documentation';
  return 'config';
};

const getProjectFileImportMode = (file: ProjectFile): ExportFileImportMode => {
  if (file.path.toLowerCase().endsWith('.css')) return 'side-effect';
  return 'copy-only';
};

const getProjectSourceTrace = (file: ProjectFile): ExportSourceTrace[] => [
  {
    sourceRef: {
      domain: 'project-config',
      id: file.id,
      path: file.path,
    },
    ...(file.templateId ? { artifactId: file.templateId } : {}),
  },
];

const getPublicSourceTrace = (file: PublicExportFile): ExportSourceTrace[] => [
  {
    sourceRef: {
      domain: 'asset',
      id: file.id,
      path: file.path,
    },
  },
];

const getPublicFileName = (path: string) =>
  path.split('/').filter(Boolean).at(-1) ?? path;

const sortJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJsonValue(item)])
  );
};

const toPrettyJson = (value: unknown) =>
  `${JSON.stringify(sortJsonValue(value), null, 2)}\n`;

const toExportPathSegment = (value: string, fallback: string) => {
  const safe = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || fallback;
};

const toDependencyVersion = (version: string) => {
  const trimmed = version.trim();
  return trimmed || 'latest';
};

const getI18nSourceTrace = (
  document: WorkspaceDocument,
  path: string
): ExportSourceTrace[] => [
  {
    sourceRef: {
      domain: 'i18n',
      id: document.id,
      path,
    },
  },
];

const getExternalLibrarySourceTrace = (
  document: WorkspaceDocument,
  libraryId?: string
): ExportSourceTrace[] => [
  {
    sourceRef: {
      domain: 'external-library',
      id: libraryId ?? document.id,
      path: document.path,
    },
  },
];

const toProjectFileContribution = (
  file: ProjectFile
): ExportArtifactContribution => {
  const resolvedSource = resolveWorkspaceDocumentExportSource({
    label: file.path,
  });
  return {
    id: `project-file:${file.id}`,
    kind: getProjectArtifactKind(file),
    suggestedName: file.path,
    language: file.path.toLowerCase().endsWith('.md') ? 'md' : undefined,
    mimeType: file.mime,
    contents: file.content,
    placement: {
      desiredPath: file.path,
      fileKind: projectFileKindByKind[file.kind] ?? 'config',
      importMode: getProjectFileImportMode(file),
    },
    sourceTrace: getProjectSourceTrace(file),
    origin: resolvedSource.origin,
  };
};

const toPublicAssetContribution = (
  file: PublicExportFile
): ExportArtifactContribution => {
  const resolvedSource = resolveWorkspaceDocumentExportSource({
    label: file.path,
  });
  const binaryContents =
    file.textContent == null && file.contentRef?.startsWith('data:')
      ? decodeDataUrlToBytes(file.contentRef)
      : null;
  return {
    id: `public-asset:${file.id}`,
    kind: 'asset',
    suggestedName: getPublicFileName(file.path),
    mimeType: file.mime,
    contents: file.textContent ?? binaryContents ?? undefined,
    publicPath: file.path,
    placement: {
      deliveryPolicy: 'public',
    },
    sourceTrace: getPublicSourceTrace(file),
    origin: {
      ...resolvedSource.origin,
      writePolicy: 'copy',
    },
  };
};

const createI18nFileContributions = (
  documentsById: WorkspaceDocumentsById
): ExportArtifactContribution[] => {
  const document = getWorkspaceI18nResourceDocument(documentsById);
  if (!document) return [];

  const { store, reviewedMap } =
    buildI18nResourceValueFromWorkspace(documentsById);
  const files: ExportArtifactContribution[] = [];
  Object.entries(store).forEach(([locale, namespaces]) => {
    const localeSegment = toExportPathSegment(locale, 'locale');
    Object.entries(namespaces).forEach(([namespace, translations]) => {
      const namespaceSegment = toExportPathSegment(namespace, 'namespace');
      const tracePath = `src/i18n/locales/${localeSegment}/${namespaceSegment}.json`;
      const resolvedSource = resolveWorkspaceDocumentExportSource({
        label: tracePath,
      });
      files.push({
        id: `i18n:${locale}:${namespace}`,
        kind: 'metadata',
        suggestedName: `${namespaceSegment}.json`,
        language: 'json',
        mimeType: 'application/json',
        contents: toPrettyJson(translations),
        placement: {
          desiredPath: `i18n/locales/${localeSegment}/${namespaceSegment}.json`,
          baseDirectory: 'source-root',
          fileKind: 'metadata',
          importMode: 'copy-only',
        },
        sourceTrace: getI18nSourceTrace(document, tracePath),
        origin: {
          ...resolvedSource.origin,
          writePolicy: 'copy',
        },
      });
    });
  });

  const manifestSource = resolveWorkspaceDocumentExportSource({
    label: 'src/i18n/manifest.json',
  });
  files.push({
    id: `i18n:${document.id}:manifest`,
    kind: 'metadata',
    suggestedName: 'manifest.json',
    language: 'json',
    mimeType: 'application/json',
    contents: toPrettyJson({
      locales: Object.keys(store),
      namespaces: Array.from(
        new Set(
          Object.values(store).flatMap((namespaces) => Object.keys(namespaces))
        )
      ),
      reviewedMap,
    }),
    placement: {
      desiredPath: 'i18n/manifest.json',
      baseDirectory: 'source-root',
      fileKind: 'metadata',
      importMode: 'copy-only',
    },
    sourceTrace: getI18nSourceTrace(document, 'src/i18n/manifest.json'),
    origin: {
      ...manifestSource.origin,
      writePolicy: 'copy',
    },
  });

  return files;
};

const createExternalLibraryDependencies = (
  documentsById: WorkspaceDocumentsById
): ExportDependency[] => {
  const document = getWorkspaceExternalLibrariesDocument(documentsById);
  if (!document) return [];

  const value = buildExternalLibrariesValueFromWorkspace(documentsById);
  return value.activeLibraries.flatMap((library): ExportDependency[] => {
    const catalog = LIBRARY_CATALOG[library.id];
    const metadata = getBundledOfficialPlugin(library.id)
      ? undefined
      : value.metadataCache[library.id];
    const primaryPackageName = catalog?.packageName ?? library.id;
    const dependencies = [
      {
        name: primaryPackageName,
        version: toDependencyVersion(library.version),
        kind: 'dependency' as const,
      },
      ...(catalog?.packageDependencies ?? []).map((dependency) => ({
        name: dependency.name,
        version: dependency.version ?? toDependencyVersion(library.version),
        kind: dependency.kind ?? ('dependency' as const),
      })),
    ];

    return dependencies.map((dependency) =>
      completeExportDependencyOrigin(
        {
          name: dependency.name,
          version: dependency.version,
          kind: dependency.kind,
        },
        {
          updatePolicy: value.mode === 'locked' ? 'pin' : 'follow-package',
          metadata: {
            [dependency.name]: {
              license: metadata?.license ?? catalog?.license,
              owner: 'third-party',
            },
          },
        }
      )
    );
  });
};

const createExternalLibraryConfigContribution = (
  documentsById: WorkspaceDocumentsById
): ExportArtifactContribution[] => {
  const document = getWorkspaceExternalLibrariesDocument(documentsById);
  if (!document) return [];

  const value = buildExternalLibrariesValueFromWorkspace(documentsById);
  if (
    value.activeLibraries.length === 0 &&
    value.componentLibraryIds.length === 0 &&
    value.iconLibraryIds.length === 0
  ) {
    return [];
  }

  const libraries = value.activeLibraries.map((library) => {
    const catalog = LIBRARY_CATALOG[library.id];
    const metadata = getBundledOfficialPlugin(library.id)
      ? undefined
      : value.metadataCache[library.id];
    const packageName = catalog?.packageName ?? library.id;
    return {
      id: library.id,
      packageName,
      packageDependencies: catalog?.packageDependencies ?? [],
      scope: library.scope,
      version: toDependencyVersion(library.version),
      license: metadata?.license ?? catalog?.license ?? null,
    };
  });
  const resolvedSource = resolveWorkspaceDocumentExportSource({
    label: 'src/prodivix.external-libraries.json',
  });

  return [
    {
      id: `external-libraries:${document.id}:manifest`,
      kind: 'metadata',
      suggestedName: 'prodivix.external-libraries.json',
      language: 'json',
      mimeType: 'application/json',
      contents: toPrettyJson({
        mode: value.mode,
        componentLibraryIds: value.componentLibraryIds,
        iconLibraryIds: value.iconLibraryIds,
        libraries,
      }),
      placement: {
        desiredPath: 'prodivix.external-libraries.json',
        baseDirectory: 'source-root',
        fileKind: 'metadata',
        importMode: 'copy-only',
      },
      sourceTrace: getExternalLibrarySourceTrace(document),
      origin: {
        ...resolvedSource.origin,
        writePolicy: 'copy',
      },
    },
  ];
};

export const createWorkspaceResourceExportContributions = (input: {
  workspaceDocumentsById: WorkspaceDocumentsById;
  projectFiles: ProjectFile[];
  publicFiles: PublicExportFile[];
}): ExportProgramContribution[] => [
  {
    artifacts: [
      ...input.projectFiles.map(toProjectFileContribution),
      ...createI18nFileContributions(input.workspaceDocumentsById),
      ...createExternalLibraryConfigContribution(input.workspaceDocumentsById),
      ...input.publicFiles.map(toPublicAssetContribution),
    ],
    dependencies: createExternalLibraryDependencies(
      input.workspaceDocumentsById
    ),
  },
  createStaticDeploymentExportContribution({
    target: 'static-hosting',
    outputDirectory: 'dist',
  }),
];

export const createRouteGraphExportContributions = (input: {
  routeManifest: WorkspaceRouteManifest;
  workspaceDocumentsById: WorkspaceDocumentsById;
  codeArtifacts: ReactGeneratorCodeArtifact[];
}): ExportProgramContribution[] => [
  createRouteExportContribution({
    manifest: input.routeManifest,
    target: {
      framework: 'react',
      preset: 'vite',
    },
    documentInfo: (documentId) => {
      const document = input.workspaceDocumentsById[documentId];
      if (!document) return null;
      return {
        id: document.id,
        path: document.path,
        type: document.type,
      };
    },
    codeArtifactInfo: (artifactId) => {
      const artifact = input.codeArtifacts.find(
        (item) => item.id === artifactId
      );
      if (!artifact) return null;
      return {
        id: artifact.id,
        path: artifact.path,
      };
    },
  }),
];
