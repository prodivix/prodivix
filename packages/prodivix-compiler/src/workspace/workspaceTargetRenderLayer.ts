import type {
  WorkspacePirDocument,
  WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { BinaryAssetMaterialization } from '@prodivix/assets';
import type {
  ExportDependency,
  ExportModule,
  ExportPlannerPreset,
  ExportProgramContribution,
  ExportRoot,
  ExportRouteTopology,
} from '#src/export';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import type { TargetAdapter } from '#src/core/adapter';
import type { CodegenPolicySnapshot } from '#src/core/codegenPolicy';
import type { PackageResolverOptions } from '#src/core/packageResolver';
import type { ExecutableProjectDataMockProvision } from '@prodivix/runtime-core';
import type { ServerRuntimeTestProvision } from '@prodivix/server-runtime';
import type { WorkspaceDataRuntimeTarget } from '#src/workspace/workspaceDataRuntimeTarget';
import type {
  WorkspaceServerRuntimeTarget,
  WorkspaceServerRuntimeTargetAnalysis,
} from '#src/workspace/workspaceServerRuntimeTarget';

/** Compile options shared by every framework target. */
export type WorkspaceTargetCompileOptions = Readonly<{
  adapter?: TargetAdapter;
  codegenPolicySnapshot?: CodegenPolicySnapshot;
  packageResolver?: PackageResolverOptions;
  exportContributions?: ExportProgramContribution[];
  projectName?: string;
  dataMockProvision?: ExecutableProjectDataMockProvision;
  dataRuntimeTarget?: WorkspaceDataRuntimeTarget;
  serverRuntimeTarget?: WorkspaceServerRuntimeTarget;
  serverRuntimeMockProvision?: ServerRuntimeTestProvision;
  assetMaterializations?: readonly BinaryAssetMaterialization[];
}>;

export type WorkspaceExportCodeArtifact = {
  id: string;
  path: string;
  language: string;
  source: string;
};

/**
 * One PIR document compiles to one component module in every target. The
 * module id, `ownerRootId` and SourceTrace granularity are part of the shared
 * topology, not a per-target choice — cross-target behaviour findings, visual
 * baselines and SourceTrace navigation can only align if both targets attribute
 * to the same module boundary.
 */
export type CompiledWorkspacePirDocument = {
  componentName: string;
  document: WorkspacePirDocument;
  module: ExportModule;
};

export type CompiledWorkspacePirProjection = Readonly<{
  documents: readonly CompiledWorkspacePirDocument[];
  contribution: ExportProgramContribution;
}>;

/** What a target returns for one PIR document. */
export type WorkspacePirDocumentCompileResult = Readonly<{
  status: 'ready' | 'blocked';
  diagnostics: readonly CompileDiagnostic[];
  modules: readonly ExportModule[];
  roots: readonly ExportRoot[];
  dependencies: readonly ExportDependency[];
  moduleNameByDocumentId: Readonly<Record<string, string>>;
}>;

/**
 * A target's per-document emitter. It decides a module's source text and its
 * own id namespace; it does not decide how many modules a document produces,
 * how they are deduplicated, or what they are attributed to — that topology is
 * owned by `compileWorkspacePirDocumentProjection`.
 */
export type WorkspacePirDocumentModuleCompiler = Readonly<{
  compileDocument(documentId: string): WorkspacePirDocumentCompileResult;
  moduleIdForDocument(documentId: string): string;
}>;

export type WorkspaceTargetAppModuleInput = Readonly<{
  compiledDocuments: readonly CompiledWorkspacePirDocument[];
  executableModuleIdByArtifactId: ReadonlyMap<string, string>;
  routeTopology: ExportRouteTopology;
  serverRuntime: WorkspaceServerRuntimeTargetAnalysis;
}>;

export type WorkspaceTargetScaffoldInput = Readonly<{
  projectName: string;
  dependencies: readonly ExportDependency[];
  entryModuleId: string;
}>;

/**
 * The only surface a framework target owns. Everything else — document
 * ordering, Data/Route/NodeGraph/Animation contributions, runtime analysis,
 * program metadata — is shared, so a target cannot fork the canonical
 * compilation topology (ADR 31:344).
 */
export type WorkspaceTargetRenderLayer = Readonly<{
  preset: ExportPlannerPreset;
  /** Used only in route composition diagnostics, e.g. `React/Vite`. */
  routeAdapterName: string;
  compilePirDocuments(input: {
    workspace: WorkspaceSnapshot;
    documents: readonly WorkspacePirDocument[];
    options: WorkspaceTargetCompileOptions;
  }): CompiledWorkspacePirProjection;
  createAppModule(input: WorkspaceTargetAppModuleInput): {
    module: ExportModule;
    diagnostics: CompileDiagnostic[];
  };
  createTargetDependencies(): readonly ExportDependency[];
  createScaffoldContributions(
    input: WorkspaceTargetScaffoldInput
  ): readonly ExportProgramContribution[];
}>;
