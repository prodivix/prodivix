import type {
  PIRCollectionPreviewInput,
  PIRCollectionProjectionLocation,
  PIRCollectionProjectionIssue,
  PIRRuntimeValueScope,
  PIRTriggerBinding,
  PIRValueBinding,
} from '@prodivix/pir';
import type {
  WorkspaceComponentDependencyGraph,
  WorkspacePirProjectionSnapshotIdentity,
  WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { TargetAdapter } from '#src/core/adapter';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import type { PackageResolverOptions } from '#src/core/packageResolver';
import type {
  ExportModule,
  ExportProgramContribution,
} from '#src/export/types';

export type PIRReactRuntimeTriggerDispatch = Readonly<{
  binding: PIRTriggerBinding;
  payload: unknown;
  scope: PIRRuntimeValueScope;
  setStateById: PIRReactStateUpdater;
}>;

export type PIRReactStateUpdater = (stateId: string, value: unknown) => void;

export type PIRReactCollectionProjectionIssueReport = Readonly<{
  location: PIRCollectionProjectionLocation;
  issues: readonly PIRCollectionProjectionIssue[];
}>;

export type PIRReactCodeReference = Extract<
  PIRValueBinding,
  { kind: 'code' }
>['reference'];

/** Runtime capabilities required by generated PIR modules. */
export type PIRReactRuntimePort = Readonly<{
  dispatchTrigger(input: PIRReactRuntimeTriggerDispatch): void;
  resolveCollectionPreviewState?(
    location: PIRCollectionProjectionLocation
  ): PIRCollectionPreviewInput | undefined;
  reportCollectionProjectionIssues?(
    input: PIRReactCollectionProjectionIssueReport
  ): void;
  resolveCodeValue(
    reference: PIRReactCodeReference,
    scope: PIRRuntimeValueScope
  ): unknown;
}>;

export type CompileWorkspacePirReactModulesInput = Readonly<{
  workspace: WorkspaceSnapshot;
  entryDocumentId: string;
  adapter?: TargetAdapter;
  packageResolver?: PackageResolverOptions;
}>;

type WorkspacePirReactCompileResultBase = Readonly<{
  graph: WorkspaceComponentDependencyGraph;
  diagnostics: readonly CompileDiagnostic[];
  modules: readonly ExportModule[];
  contribution: ExportProgramContribution;
}>;

export type WorkspacePirReactCompileReady = WorkspacePirReactCompileResultBase &
  Readonly<{
    status: 'ready';
    snapshotIdentity: WorkspacePirProjectionSnapshotIdentity;
    dependencyFirstDocumentIds: readonly string[];
    componentDocumentIds: readonly string[];
    moduleIdByDocumentId: Readonly<Record<string, string>>;
    moduleNameByDocumentId: Readonly<Record<string, string>>;
  }>;

export type WorkspacePirReactCompileBlocked =
  WorkspacePirReactCompileResultBase &
    Readonly<{
      status: 'blocked';
    }>;

export type WorkspacePirReactCompileResult =
  WorkspacePirReactCompileReady | WorkspacePirReactCompileBlocked;
