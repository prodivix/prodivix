import type { CompileDiagnostic } from '#src/core/diagnostics';

export type ExportTargetFramework =
  | 'react'
  | 'vue'
  | 'svelte'
  | 'solid'
  | 'lit'
  | 'astro'
  | 'web-components'
  | 'native';

export type ExportTarget = {
  framework: ExportTargetFramework;
  preset: string;
};

export type ExportRootKind =
  | 'app'
  | 'route'
  | 'page'
  | 'component'
  | 'nodegraph'
  | 'animation';

export type ExportModuleKind =
  | 'react-component'
  | 'react-entry'
  | 'nodegraph-runtime'
  | 'animation-runtime'
  | 'event-handler'
  | 'adapter'
  | 'workspace-module'
  | 'runtime-helper'
  | 'domain-module';

export type ExportStyleScope = 'component' | 'route' | 'layout' | 'global';

export type ExportFileKind =
  | 'source-module'
  | 'stylesheet'
  | 'runtime-module'
  | 'domain-module'
  | 'shader'
  | 'asset'
  | 'config'
  | 'deployment'
  | 'metadata'
  | 'documentation';

export type ExportImportKind =
  | 'default'
  | 'named'
  | 'namespace'
  | 'side-effect'
  | 'asset-url';

export type ExportSourceOriginKind =
  | 'generated'
  | 'workspace-document'
  | 'external-package'
  | 'plugin'
  | 'vendored'
  | 'remote-url';

export type ExportSourceOwner =
  | 'prodivix'
  | 'workspace'
  | 'plugin'
  | 'third-party';

export type ExportWritePolicy =
  | 'generated'
  | 'preserve-user-edits'
  | 'copy'
  | 'reference-only';

export type ExportUpdatePolicy =
  | 'regenerate'
  | 'pin'
  | 'manual'
  | 'follow-package';

export type ExportAssetDeliveryPolicy =
  | 'copy'
  | 'reference'
  | 'vendor'
  | 'public';

export type ExportArtifactKind =
  | 'source'
  | 'style'
  | 'runtime'
  | 'domain'
  | 'shader'
  | 'asset'
  | 'config'
  | 'deployment'
  | 'metadata'
  | 'documentation'
  | 'adapter';

export type DiagnosticTargetRef = {
  domain: string;
  id: string;
  path?: string;
};

export type SourceSpan = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type ExportSourceTrace = {
  sourceRef: DiagnosticTargetRef;
  artifactId?: string;
  sourceSpan?: SourceSpan;
  ownerRootId?: string;
};

export type ExportSourceOrigin = {
  kind: ExportSourceOriginKind;
  owner?: ExportSourceOwner;
  label?: string;
  packageName?: string;
  packageVersion?: string;
  url?: string;
  license?: string;
  contentHash?: string;
  writePolicy?: ExportWritePolicy;
  updatePolicy?: ExportUpdatePolicy;
};

export type ExportImportIntent = {
  source: string;
  imported?: string;
  local?: string;
  kind: ExportImportKind;
};

export type ExportDependency = {
  name: string;
  version: string;
  kind?: 'dependency' | 'devDependency' | 'peerDependency';
  origin?: ExportSourceOrigin;
};

export type ExportRoot = {
  id: string;
  kind: ExportRootKind;
  displayName: string;
  routePath?: string;
  sourceRef: DiagnosticTargetRef;
};

export type ExportModule = {
  id: string;
  kind: ExportModuleKind;
  ownerRootId?: string;
  suggestedName: string;
  language: 'ts' | 'tsx' | 'js' | 'jsx';
  imports: ExportImportIntent[];
  body: string;
  sourceTrace: ExportSourceTrace[];
  origin?: ExportSourceOrigin;
};

export type ExportOrderHint = {
  group?: string;
  index?: number;
};

export type ExportStyleContribution = {
  id: string;
  ownerRootId?: string;
  scope: ExportStyleScope;
  suggestedName?: string;
  cssText: string;
  orderHint?: ExportOrderHint;
  selectors?: string[];
  imports?: ExportImportIntent[];
  sourceTrace: ExportSourceTrace[];
  origin?: ExportSourceOrigin;
};

export type ExportAssetContribution = {
  id: string;
  suggestedName: string;
  mediaType?: string;
  contents?: string | Uint8Array;
  sourcePath?: string;
  publicPath?: string;
  deliveryPolicy?: ExportAssetDeliveryPolicy;
  sourceTrace: ExportSourceTrace[];
  origin?: ExportSourceOrigin;
};

export type ExportProgramMetadata = Record<string, unknown>;

export type StaticDeploymentTarget =
  | 'github-pages'
  | 'vercel'
  | 'netlify'
  | 'static-hosting';

export type ExportDeploymentTarget =
  | 'nginx'
  | 'cloudflare-pages'
  | StaticDeploymentTarget
  | string;

export type ExportDeploymentContribution = {
  id: string;
  target: ExportDeploymentTarget;
  files: ExportFileContribution[];
  dependencies?: ExportDependency[];
  diagnostics?: CompileDiagnostic[];
  metadata?: ExportProgramMetadata;
};

export type ExportFileContribution = {
  id: string;
  desiredPath: string;
  baseDirectory?: 'project-root' | 'source-root' | 'public-root';
  kind: ExportFileKind;
  language?: string;
  mimeType?: string;
  importMode?: ExportFileImportMode;
  contents: string | Uint8Array;
  sourceTrace: ExportSourceTrace[];
  origin?: ExportSourceOrigin;
};

export type ExportArtifactPlacement = {
  desiredPath?: string;
  baseDirectory?: ExportFileContribution['baseDirectory'];
  deliveryPolicy?: ExportAssetDeliveryPolicy;
  importMode?: ExportFileImportMode;
  fileKind?: ExportFileKind;
  styleScope?: ExportStyleScope;
};

export type ExportArtifactContribution = {
  id: string;
  kind: ExportArtifactKind;
  ownerRootId?: string;
  suggestedName: string;
  language?: string;
  mimeType?: string;
  contents?: string | Uint8Array;
  sourcePath?: string;
  publicPath?: string;
  placement?: ExportArtifactPlacement;
  orderHint?: ExportOrderHint;
  selectors?: string[];
  imports?: ExportImportIntent[];
  sourceTrace: ExportSourceTrace[];
  origin?: ExportSourceOrigin;
  metadata?: ExportProgramMetadata;
};

export type ExportRuntimeRequirement = {
  id: string;
  kind:
    | 'event-runtime'
    | 'nodegraph-runtime'
    | 'animation-runtime'
    | 'adapter-runtime';
  ownerModuleId?: string;
  importName?: string;
  importKind?: Extract<ExportImportKind, 'named' | 'default' | 'namespace'>;
  sourceTrace: ExportSourceTrace[];
};

export type ExportRuntimeModuleFactory = (
  requirement: ExportRuntimeRequirement
) => ExportModule | null;

export type ExportBundleMetadata = ExportProgramMetadata & {
  generatedAt?: string;
  sourceTraceCount?: number;
  sourceTraceSummary?: ExportSourceTraceSummary[];
  sourceSummary?: ExportSourceSummary[];
  dependencySummary?: ExportDependencySummary[];
  diagnosticSummary?: ExportDiagnosticSummary[];
  originSummary?: ExportOriginSummary[];
  licenseSummary?: ExportLicenseSummary[];
  deploymentSummary?: ExportDeploymentSummary[];
  fileCount?: number;
  pathRewrites?: ExportPathRewrite[];
  referencedAssets?: ExportReferencedAsset[];
};

export type ExportSourceTraceSummary = {
  domain: string;
  count: number;
  files: string[];
};

export type ExportSourceSummary = {
  kind: ExportSourceOriginKind;
  owner?: ExportSourceOwner;
  packageName?: string;
  packageVersion?: string;
  url?: string;
  license?: string;
  count: number;
  files: string[];
};

export type ExportDependencySummary = {
  name: string;
  kind: NonNullable<ExportDependency['kind']>;
  version: string;
  origin?: ExportSourceOrigin;
};

export type ExportDiagnosticSummary = {
  severity: CompileDiagnostic['severity'];
  count: number;
};

export type ExportOriginSummary = {
  id: string;
  kind: ExportSourceOriginKind;
  owner?: ExportSourceOwner;
  label?: string;
  packageName?: string;
  packageVersion?: string;
  url?: string;
  license?: string;
  contentHash?: string;
  writePolicy?: ExportWritePolicy;
  updatePolicy?: ExportUpdatePolicy;
  files: string[];
};

export type ExportLicenseSummary = {
  license: string;
  origins: ExportOriginSummary[];
};

export type ExportDeploymentSummary = {
  id: string;
  target: ExportDeploymentTarget;
  files: string[];
  dependencies: ExportDependencySummary[];
  metadata?: ExportProgramMetadata;
};

export type ExportPathRewrite = {
  requestedPath: string;
  emittedPath: string;
  reason: 'conflict' | 'normalization';
  sourceId?: string;
  sourceKind?: ExportFileKind | ExportModuleKind | 'style' | 'asset';
};

export type ReserveExportPath = (
  desiredPath: string,
  source?: {
    id?: string;
    kind?: ExportFileKind | ExportModuleKind | 'style' | 'asset';
  }
) => string;

export type ExportReferencedAsset = {
  id: string;
  suggestedName: string;
  deliveryPolicy?: ExportAssetDeliveryPolicy;
  publicPath?: string;
  sourcePath?: string;
  emittedPath?: string;
  url?: string;
  mediaType?: string;
  origin?: ExportSourceOrigin;
};

export type ExportProgram = {
  target: ExportTarget;
  entryModuleId?: string;
  entryFilePath?: string;
  roots: ExportRoot[];
  modules: ExportModule[];
  styles: ExportStyleContribution[];
  assets: ExportAssetContribution[];
  artifacts: ExportArtifactContribution[];
  files: ExportFileContribution[];
  sources: ExportSourceOrigin[];
  deployments: ExportDeploymentContribution[];
  runtimeRequirements: ExportRuntimeRequirement[];
  dependencies: ExportDependency[];
  diagnostics: CompileDiagnostic[];
  metadata?: ExportProgramMetadata;
};

export type ExportProgramContribution = {
  entryModuleId?: string;
  entryFilePath?: string;
  roots?: ExportRoot[];
  modules?: ExportModule[];
  styles?: ExportStyleContribution[];
  assets?: ExportAssetContribution[];
  artifacts?: ExportArtifactContribution[];
  files?: ExportFileContribution[];
  sources?: ExportSourceOrigin[];
  deployments?: ExportDeploymentContribution[];
  runtimeRequirements?: ExportRuntimeRequirement[];
  dependencies?: ExportDependency[];
  diagnostics?: CompileDiagnostic[];
  metadata?: ExportProgramMetadata;
};

export type ExportFileImportMode =
  | 'module'
  | 'side-effect'
  | 'asset-url'
  | 'copy-only';

export type ExportFile = {
  id?: string;
  path: string;
  kind: ExportFileKind;
  language?: string;
  mimeType?: string;
  importMode?: ExportFileImportMode;
  contents: string | Uint8Array;
  contentHash?: string;
  sourceTrace: ExportSourceTrace[];
  origin?: ExportSourceOrigin;
};

export type ExportBundle = {
  target: ExportTarget;
  entryFilePath?: string;
  files: ExportFile[];
  dependencies: ExportDependency[];
  diagnostics: CompileDiagnostic[];
  metadata?: ExportBundleMetadata;
};

export type PlannedExportModule = ExportModule & {
  filePath: string;
  renderedImports: string[];
};

export type PlannedRuntimeModule = PlannedExportModule & {
  requirements: ExportRuntimeRequirement[];
};

export type PlannedStyleSheet = {
  id?: string;
  path: string;
  ownerRootId?: string;
  cssText: string;
  sourceTrace: ExportSourceTrace[];
  origin?: ExportSourceOrigin;
};

export type ExportPlannerPreset = {
  id: string;
  target: ExportTarget;
  sourceRoot: string;
  createScaffoldContributions?: (
    context: ExportScaffoldContext
  ) => ExportProgramContribution[];
  runtimeModuleFactories?: Partial<
    Record<ExportRuntimeRequirement['kind'], ExportRuntimeModuleFactory>
  >;
};

export type ExportScaffoldContext = {
  projectName: string;
  packageManager?: string;
  dependencies: ExportDependency[];
  entryModuleId?: string;
  entryFilePath?: string;
  metadata?: ExportProgramMetadata;
};
