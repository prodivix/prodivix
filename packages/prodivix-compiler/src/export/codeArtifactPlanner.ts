import type {
  ExportArtifactContribution,
  ExportFileContribution,
  ExportFileImportMode,
  ExportFileKind,
  ExportSourceTrace,
  ExportStyleContribution,
} from '#src/export/types';
import { resolveWorkspaceDocumentExportSource } from '#src/export/sourceResolver';

export type ExportCodeArtifact = {
  id: string;
  path: string;
  language?: string;
  source: string;
};

const SAFE_SEGMENT_PATTERN = /[^a-zA-Z0-9._-]/g;

const sanitizePathSegment = (segment: string) => {
  const sanitized = segment.replace(SAFE_SEGMENT_PATTERN, '-');
  return sanitized || 'file';
};

export const isExportCssCodeArtifact = (artifact: ExportCodeArtifact) =>
  artifact.language === 'css' || artifact.path.toLowerCase().endsWith('.css');

export const getExportCodeArtifactLanguage = (artifact: ExportCodeArtifact) => {
  const lowerPath = artifact.path.toLowerCase();
  if (artifact.language) return artifact.language;
  if (lowerPath.endsWith('.tsx')) return 'tsx';
  if (lowerPath.endsWith('.ts')) return 'ts';
  if (lowerPath.endsWith('.jsx')) return 'jsx';
  if (lowerPath.endsWith('.js')) return 'js';
  if (lowerPath.endsWith('.json')) return 'json';
  if (lowerPath.endsWith('.glsl')) return 'glsl';
  if (lowerPath.endsWith('.wgsl')) return 'wgsl';
  return 'text';
};

export const getExportCodeArtifactFileKind = (
  artifact: ExportCodeArtifact
): ExportFileKind => {
  const lowerPath = artifact.path.toLowerCase();
  const language = getExportCodeArtifactLanguage(artifact);
  if (language === 'glsl' || language === 'wgsl') return 'shader';
  if (lowerPath.endsWith('.json')) return 'config';
  return 'source-module';
};

export const getExportCodeArtifactMimeType = (artifact: ExportCodeArtifact) => {
  const language = getExportCodeArtifactLanguage(artifact);
  if (language === 'ts' || language === 'tsx') return 'text/typescript';
  if (language === 'js' || language === 'jsx') return 'text/javascript';
  if (language === 'json') return 'application/json';
  if (language === 'glsl' || language === 'wgsl') return 'text/plain';
  return 'text/plain';
};

export const getExportCodeArtifactImportMode = (
  artifact: ExportCodeArtifact
): ExportFileImportMode => {
  const kind = getExportCodeArtifactFileKind(artifact);
  if (kind === 'shader') return 'asset-url';
  if (kind === 'source-module') return 'module';
  return 'copy-only';
};

const getExportCodeArtifactKind = (
  artifact: ExportCodeArtifact
): ExportArtifactContribution['kind'] => {
  const fileKind = getExportCodeArtifactFileKind(artifact);
  if (fileKind === 'shader') return 'shader';
  if (fileKind === 'config') return 'config';
  return 'source';
};

export const normalizeExportCodeArtifactPath = (path: string) =>
  path
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/^code\//, '')
    .replace(/^src\//, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => segment !== '.' && segment !== '..')
    .map(sanitizePathSegment)
    .join('/');

const createCodeArtifactSourceTrace = (
  artifact: ExportCodeArtifact,
  ownerRootId?: string
): ExportSourceTrace[] => [
  {
    sourceRef: {
      domain: 'code',
      id: artifact.id,
      path: artifact.path,
    },
    artifactId: artifact.id,
    ownerRootId,
  },
];

export const collectExportCodeArtifactFileContributions = (
  codeArtifacts: ExportCodeArtifact[] = []
): ExportFileContribution[] =>
  collectExportCodeArtifactContributions(codeArtifacts).map((artifact) => ({
    id: artifact.id,
    desiredPath:
      artifact.placement?.desiredPath ??
      normalizeExportCodeArtifactPath(artifact.suggestedName),
    baseDirectory: artifact.placement?.baseDirectory,
    kind:
      artifact.placement?.fileKind ??
      getExportCodeArtifactFileKind({
        id: artifact.id,
        path: artifact.suggestedName,
        language: artifact.language,
        source: typeof artifact.contents === 'string' ? artifact.contents : '',
      }),
    language: artifact.language,
    mimeType: artifact.mimeType,
    importMode: artifact.placement?.importMode,
    contents: artifact.contents ?? '',
    sourceTrace: artifact.sourceTrace,
    origin: artifact.origin,
  }));

export const collectExportCodeArtifactContributions = (
  codeArtifacts: ExportCodeArtifact[] = []
): ExportArtifactContribution[] =>
  codeArtifacts
    .filter((artifact) => !isExportCssCodeArtifact(artifact))
    .map((artifact) => {
      const desiredPath =
        normalizeExportCodeArtifactPath(artifact.path) ||
        `${artifact.id}.${getExportCodeArtifactLanguage(artifact)}`;
      const resolvedSource = resolveWorkspaceDocumentExportSource({
        label: artifact.path,
      });
      return {
        id: `workspace-code:${artifact.id}`,
        kind: getExportCodeArtifactKind(artifact),
        suggestedName: desiredPath,
        language: getExportCodeArtifactLanguage(artifact),
        mimeType: getExportCodeArtifactMimeType(artifact),
        contents: artifact.source,
        placement: {
          desiredPath,
          baseDirectory: 'source-root',
          fileKind: getExportCodeArtifactFileKind(artifact),
          importMode: getExportCodeArtifactImportMode(artifact),
        },
        sourceTrace: createCodeArtifactSourceTrace(artifact),
        origin: resolvedSource.origin,
      };
    });

export const createExportCodeArtifactStyleContribution = (input: {
  artifact: ExportCodeArtifact;
  id: string;
  ownerRootId?: string;
  suggestedName?: string;
  cssText: string;
  orderIndex: number;
}): ExportStyleContribution => {
  const resolvedSource = resolveWorkspaceDocumentExportSource({
    label: input.artifact.path,
  });
  return {
    id: input.id,
    ownerRootId: input.ownerRootId,
    scope: 'component',
    suggestedName: input.suggestedName,
    cssText: input.cssText,
    orderHint: {
      group: 'mounted-css',
      index: input.orderIndex,
    },
    sourceTrace: createCodeArtifactSourceTrace(
      input.artifact,
      input.ownerRootId
    ),
    origin: resolvedSource.origin,
  };
};

export const createExportCodeArtifactStyleArtifactContribution = (input: {
  artifact: ExportCodeArtifact;
  id: string;
  ownerRootId?: string;
  suggestedName?: string;
  cssText: string;
  orderIndex: number;
}): ExportArtifactContribution => {
  const resolvedSource = resolveWorkspaceDocumentExportSource({
    label: input.artifact.path,
  });
  return {
    id: input.id,
    kind: 'style',
    ownerRootId: input.ownerRootId,
    suggestedName: input.suggestedName ?? input.artifact.path,
    language: 'css',
    mimeType: 'text/css',
    contents: input.cssText,
    placement: {
      styleScope: 'component',
    },
    orderHint: {
      group: 'mounted-css',
      index: input.orderIndex,
    },
    sourceTrace: createCodeArtifactSourceTrace(
      input.artifact,
      input.ownerRootId
    ),
    origin: resolvedSource.origin,
  };
};
