export {
  exportArtifactToProgramContribution,
  exportArtifactsToProgramContribution,
} from '#src/export/artifactPlanner';
export {
  collectExportCodeArtifactContributions,
  collectExportCodeArtifactFileContributions,
  createExportCodeArtifactStyleArtifactContribution,
  createExportCodeArtifactStyleContribution,
  getExportCodeArtifactFileKind,
  getExportCodeArtifactImportMode,
  getExportCodeArtifactLanguage,
  getExportCodeArtifactMimeType,
  isExportCssCodeArtifact,
  normalizeExportCodeArtifactPath,
} from '#src/export/codeArtifactPlanner';
export type { ExportCodeArtifact } from '#src/export/codeArtifactPlanner';
export {
  collectReferencedExportAssets,
  planExportAssetContributions,
} from '#src/export/assetPlanner';
export {
  createWorkspaceGitAssetProjection,
  type CreateWorkspaceGitAssetProjectionInput,
} from '#src/export/workspaceGitAssetProjection';
export {
  exportDependenciesToPackageFields,
  mergeExportDependencies,
} from '#src/export/dependencyPlanner';
export {
  EXPORT_KNOWN_PACKAGE_METADATA,
  completeExportDependencyOrigin,
  createExportPackageOrigin,
  recordToExportDependencies,
} from '#src/export/packageOriginResolver';
export {
  resolveExportSource,
  resolvePackageExportSource,
  resolvePluginExportSource,
  resolveRemoteExportSource,
  resolveVendoredExportSource,
  resolveWorkspaceDocumentExportSource,
} from '#src/export/sourceResolver';
export type {
  ExportResolvedSource,
  ExportSourceResolverInput,
  ExportSourceResolverKind,
} from '#src/export/sourceResolver';
export type {
  ExportPackageMetadata,
  ExportPackageOriginOptions,
} from '#src/export/packageOriginResolver';
export { createStaticDeploymentExportContribution } from '#src/export/deploymentPresets';
export { planExportFileContributions } from '#src/export/filePlanner';
export {
  ExportProgramBuilder,
  createExportProgramBuilder,
} from '#src/export/programBuilder';
export { validateExportOriginPolicy } from '#src/export/originPolicy';
export { createRouteExportContribution } from '#src/export/routeTopology';
export type {
  CreateRouteExportContributionOptions,
  RouteExportCodeArtifactInfo,
  RouteExportDocumentInfo,
} from '#src/export/routeTopology';
export {
  dedupeExportImportIntents,
  renderExportImportIntent,
} from '#src/export/importPlanner';
export {
  createUniqueExportPath,
  ensureFileExtension,
  getExportDirname,
  getRelativeImportPath,
  joinExportPath,
  normalizeExportPath,
} from '#src/export/pathPlanner';
export { toSafeExportIdentifier } from '#src/export/naming';
export { ProductionExportPlanner } from '#src/export/planner';
export {
  REACT_VITE_DEPENDENCIES,
  REACT_VITE_DEV_DEPENDENCIES,
  REACT_VITE_PACKAGE_MANAGER,
  createReactViteExportPreset,
  createReactViteScaffoldContributions,
} from '#src/export/presets/reactVite';
export {
  createStyleImportIntents,
  planExportStyleSheets,
} from '#src/export/stylePlanner';
export { compileAnimationExportContributions } from '#src/animation/compileAnimation';
export { compileNodeGraphExportContributions } from '#src/nodegraph/compileNodeGraph';
export type {
  DiagnosticTargetRef,
  ExportArtifactContribution,
  ExportArtifactKind,
  ExportArtifactPlacement,
  ExportAssetContribution,
  ExportAssetDeliveryPolicy,
  ExportBundle,
  ExportBundleMetadata,
  ExportDeploymentContribution,
  ExportDeploymentSummary,
  ExportDeploymentTarget,
  ExportDependency,
  ExportDependencySummary,
  ExportDiagnosticSummary,
  ExportFile,
  ExportFileContribution,
  ExportFileImportMode,
  ExportFileKind,
  ExportImportIntent,
  ExportImportKind,
  ExportModule,
  ExportModuleKind,
  ExportOrderHint,
  ExportLicenseSummary,
  ExportOriginSummary,
  ExportPathRewrite,
  ExportPlannerPreset,
  ExportReferencedAsset,
  ExportProgram,
  ExportProgramContribution,
  ExportProgramMetadata,
  ExportRouteGeneratedFile,
  ExportRouteOutletBinding,
  ExportRouteRuntimeRef,
  ExportRouteRuntimeRefKind,
  ExportRouteTopology,
  ExportRouteTopologyNode,
  ExportRoot,
  ExportRootKind,
  ExportScaffoldContext,
  ExportRuntimeModuleFactory,
  ExportRuntimeRequirement,
  ExportSourceOrigin,
  ExportSourceOriginKind,
  ExportSourceOwner,
  ExportSourceSummary,
  ExportSourceTrace,
  ExportSourceTraceSummary,
  ExportStyleContribution,
  ExportStyleScope,
  ExportTarget,
  ExportTargetFramework,
  ExportUpdatePolicy,
  ExportWritePolicy,
  PlannedExportModule,
  PlannedRuntimeModule,
  PlannedStyleSheet,
  ReserveExportPath,
  SourceSpan,
  StaticDeploymentTarget,
} from '#src/export/types';
export type { StaticDeploymentPresetOptions } from '#src/export/deploymentPresets';
