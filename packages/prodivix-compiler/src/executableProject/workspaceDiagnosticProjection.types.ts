import type {
  BehaviorControlProfile,
  BehaviorFixtureSet,
} from '@prodivix/behavior';
import type { DiagnosticTargetRef } from '@prodivix/diagnostics';
import type {
  ExecutableProjectFile,
  ExecutableProjectSnapshot,
  ExecutionBuildBundle,
  ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type { WorkspaceReactViteCompileOptions } from '#src/react/workspaceProject';
import type { WorkspaceVueViteCompileOptions } from '#src/vue/workspaceProject';
import type { CompilerFixtureProjectionReceipt } from './fixtureProjectionReceipt';
import type { CompilerDiagnosticTestExtensionReceipt } from './diagnosticTestExtensionReceipt';

export const WORKSPACE_DIAGNOSTIC_PROJECTION_RECEIPT_FORMAT =
  'prodivix.workspace-diagnostic-projection-receipt.v1' as const;
export const WORKSPACE_DIAGNOSTIC_TRACE_FORMAT =
  'prodivix.workspace-diagnostic-trace.v1' as const;
export const WORKSPACE_DIAGNOSTIC_COMPILER_OWNER =
  '@prodivix/prodivix-compiler' as const;

export type WorkspaceDiagnosticProjectionFinding = Readonly<{
  ruleId: string;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  targetId: string;
  messageKey: string;
  count: number;
  diagnosticCodes: readonly string[];
  sourceTraceDigest?: string;
}>;

export type WorkspaceDiagnosticTraceEntry = Readonly<{
  path: string;
  sourceTrace: readonly ExecutionSourceTrace[];
}>;

export type WorkspaceDiagnosticTrace = Readonly<{
  format: typeof WORKSPACE_DIAGNOSTIC_TRACE_FORMAT;
  traceKind: 'diagnostics';
  subjectDigest: string;
  entries: readonly WorkspaceDiagnosticTraceEntry[];
  traceDigest: string;
}>;

export type WorkspaceDiagnosticRunBinding = Readonly<{
  diagnosticCount: number;
  diagnosticsDigest: string;
}>;

export type WorkspaceDiagnosticProjectionReceipt = Readonly<{
  format: typeof WORKSPACE_DIAGNOSTIC_PROJECTION_RECEIPT_FORMAT;
  owner: typeof WORKSPACE_DIAGNOSTIC_COMPILER_OWNER;
  workspaceSnapshotDigest: string;
  semanticIndexDigest: string;
  compilerBaseSnapshotDigest: string;
  compilerProjectionDigest: string;
  target: ExecutableProjectSnapshot['target'];
  lineage: WorkspaceDiagnosticSnapshotLineage;
  diagnosticRuns: Readonly<{
    semantic: WorkspaceDiagnosticRunBinding;
    compiler: WorkspaceDiagnosticRunBinding;
    path: WorkspaceDiagnosticRunBinding;
    schema: WorkspaceDiagnosticRunBinding;
    reference: WorkspaceDiagnosticRunBinding;
    imports: WorkspaceDiagnosticRunBinding;
    dependency: WorkspaceDiagnosticRunBinding;
  }>;
  findings: readonly WorkspaceDiagnosticProjectionFinding[];
  trace: WorkspaceDiagnosticTrace;
  receiptDigest: string;
}>;

export type WorkspaceDiagnosticCompilerTarget =
  | Readonly<{
      presetId: 'react-vite';
      options?: WorkspaceReactViteCompileOptions;
    }>
  | Readonly<{
      presetId: 'vue-vite';
      options?: WorkspaceVueViteCompileOptions;
    }>;

export type CompilerFixtureProjectionAuthority = Readonly<{
  fixtureSets: readonly BehaviorFixtureSet[];
  controlProfile: BehaviorControlProfile;
  generatedFiles: readonly ExecutableProjectFile[];
  buildBundle: ExecutionBuildBundle;
  receipt: CompilerFixtureProjectionReceipt;
}>;

export type IssueWorkspaceDiagnosticProjectionReceiptInput = Readonly<{
  workspace: WorkspaceSnapshot;
  snapshot: ExecutableProjectSnapshot;
  compiler: WorkspaceDiagnosticCompilerTarget;
  testExtensionReceipts?: readonly CompilerDiagnosticTestExtensionReceipt[];
  fixtureProjectionAuthority?: CompilerFixtureProjectionAuthority;
}>;

export type WorkspaceDiagnosticSnapshotLineage = Readonly<{
  testExtensionReceiptDigests: readonly string[];
  fixtureProjectionReceiptDigest: string | null;
  lineageDigest: string;
}>;

export type WorkspaceDiagnosticOwnerCategory =
  | 'semantic'
  | 'compiler'
  | 'path'
  | 'schema'
  | 'reference'
  | 'imports'
  | 'dependency';

export type WorkspaceDiagnosticOwnerDiagnostic = Readonly<{
  category: WorkspaceDiagnosticOwnerCategory;
  code: string;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  message: string;
  path?: string;
  targetRef?: DiagnosticTargetRef;
}>;
