import type {
  ExportArtifactContribution,
  ExportAssetContribution,
  ExportFileContribution,
  ExportFileImportMode,
  ExportFileKind,
  ExportProgramContribution,
  ExportStyleContribution,
} from '#src/export/types';

const fileKindByArtifactKind: Partial<
  Record<ExportArtifactContribution['kind'], ExportFileKind>
> = {
  source: 'source-module',
  runtime: 'runtime-module',
  domain: 'domain-module',
  shader: 'shader',
  config: 'config',
  deployment: 'deployment',
  metadata: 'metadata',
  documentation: 'documentation',
  adapter: 'source-module',
};

const defaultImportModeByFileKind: Partial<
  Record<ExportFileKind, ExportFileImportMode>
> = {
  'source-module': 'module',
  'runtime-module': 'module',
  'domain-module': 'module',
  shader: 'asset-url',
  stylesheet: 'side-effect',
  asset: 'copy-only',
  config: 'copy-only',
  deployment: 'copy-only',
  metadata: 'copy-only',
  documentation: 'copy-only',
};

const getArtifactFileKind = (
  artifact: ExportArtifactContribution
): ExportFileKind =>
  artifact.placement?.fileKind ??
  fileKindByArtifactKind[artifact.kind] ??
  'source-module';

const getArtifactImportMode = (
  artifact: ExportArtifactContribution,
  kind: ExportFileKind
): ExportFileImportMode =>
  artifact.placement?.importMode ??
  defaultImportModeByFileKind[kind] ??
  'copy-only';

const getArtifactDesiredPath = (artifact: ExportArtifactContribution) =>
  artifact.placement?.desiredPath ??
  artifact.sourcePath ??
  artifact.publicPath ??
  artifact.suggestedName;

const createFileContribution = (
  artifact: ExportArtifactContribution
): ExportFileContribution | null => {
  if (artifact.contents === undefined) return null;
  const kind = getArtifactFileKind(artifact);
  return {
    id: artifact.id,
    desiredPath: getArtifactDesiredPath(artifact),
    baseDirectory: artifact.placement?.baseDirectory,
    kind,
    language: artifact.language,
    mimeType: artifact.mimeType,
    importMode: getArtifactImportMode(artifact, kind),
    contents: artifact.contents,
    sourceTrace: artifact.sourceTrace,
    origin: artifact.origin,
  };
};

const createStyleContribution = (
  artifact: ExportArtifactContribution
): ExportStyleContribution | null => {
  if (typeof artifact.contents !== 'string') return null;
  const cssText = artifact.contents.trim();
  if (!cssText) return null;
  return {
    id: artifact.id,
    ownerRootId: artifact.ownerRootId,
    scope: artifact.placement?.styleScope ?? 'component',
    suggestedName: artifact.suggestedName,
    cssText,
    orderHint: artifact.orderHint,
    selectors: artifact.selectors,
    imports: artifact.imports,
    sourceTrace: artifact.sourceTrace,
    origin: artifact.origin,
  };
};

const createAssetContribution = (
  artifact: ExportArtifactContribution
): ExportAssetContribution => ({
  id: artifact.id,
  suggestedName: artifact.suggestedName,
  mediaType: artifact.mimeType,
  contents: artifact.contents,
  sourcePath: artifact.sourcePath,
  publicPath: artifact.publicPath,
  deliveryPolicy: artifact.placement?.deliveryPolicy,
  sourceTrace: artifact.sourceTrace,
  origin: artifact.origin,
});

export const exportArtifactToProgramContribution = (
  artifact: ExportArtifactContribution
): ExportProgramContribution => {
  if (artifact.kind === 'style') {
    const style = createStyleContribution(artifact);
    return style ? { styles: [style] } : {};
  }

  if (artifact.kind === 'asset') {
    return {
      assets: [createAssetContribution(artifact)],
    };
  }

  const file = createFileContribution(artifact);
  return file ? { files: [file] } : {};
};

export const exportArtifactsToProgramContribution = (
  artifacts: ExportArtifactContribution[] = []
): ExportProgramContribution => ({
  files: artifacts
    .filter(
      (artifact) => artifact.kind !== 'style' && artifact.kind !== 'asset'
    )
    .map(createFileContribution)
    .filter((file): file is ExportFileContribution => file !== null),
  styles: artifacts
    .filter((artifact) => artifact.kind === 'style')
    .map(createStyleContribution)
    .filter((style): style is ExportStyleContribution => style !== null),
  assets: artifacts
    .filter((artifact) => artifact.kind === 'asset')
    .map(createAssetContribution),
});
