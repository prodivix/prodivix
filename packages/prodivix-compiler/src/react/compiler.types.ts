import type { DataLifecycleSnapshot } from '@prodivix/data';
import type {
  PIRCollectionPreviewInput,
  PIRCollectionProjectionLocation,
  PIRCollectionProjectionIssue,
  PIRDataOperationBinding,
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
import type { PirCompileTarget } from '#src/workspace/pirTarget';
import type {
  ExportModule,
  ExportProgramContribution,
} from '#src/export/types';

export const PIR_COMPILE_DIAGNOSTIC_CODES = Object.freeze({
  dataOperationUnresolved: 'PIR_EXPORT_DATA_OPERATION_UNRESOLVED',
  dataOperationKindMismatch: 'PIR_EXPORT_DATA_OPERATION_KIND_MISMATCH',
} as const);

export type PIRReactRuntimeTriggerDispatch = Readonly<{
  binding: PIRTriggerBinding;
  payload: unknown;
  scope: PIRRuntimeValueScope;
  runtimeValuesById: Readonly<Record<string, unknown>>;
  setStateById: PIRReactStateUpdater;
  source: Readonly<{
    documentId: string;
    nodeId: string;
    eventName: string;
    instancePath: string;
  }>;
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

export type PIRReactDataLifecycleSnapshotRequest = Readonly<{
  documentId: string;
  instancePath: string;
  dataId: string;
  binding: PIRDataOperationBinding;
}>;

/** Runtime capabilities required by generated PIR modules. */
export type PIRReactRuntimePort = Readonly<{
  dispatchTrigger(input: PIRReactRuntimeTriggerDispatch): void;
  resolveCollectionPreviewState?(
    location: PIRCollectionProjectionLocation
  ): PIRCollectionPreviewInput | undefined;
  reportCollectionProjectionIssues?(
    input: PIRReactCollectionProjectionIssueReport
  ): void;
  resolveDataLifecycleSnapshot(
    request: PIRReactDataLifecycleSnapshotRequest
  ): DataLifecycleSnapshot | undefined;
  subscribeDataLifecycle?(listener: () => void): () => void;
  resolveCodeValue(
    reference: PIRReactCodeReference,
    scope: PIRRuntimeValueScope
  ): unknown;
}>;

export type CompileWorkspacePirReactModulesInput = Readonly<{
  workspace: WorkspaceSnapshot;
  entryDocumentId: string;
  target: PirCompileTarget;
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
