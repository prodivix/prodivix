import { digestCompilerValue } from './executableProjectSnapshotCanonical';
import {
  WORKSPACE_DIAGNOSTIC_COMPILER_OWNER,
  WORKSPACE_DIAGNOSTIC_PROJECTION_RECEIPT_FORMAT,
  WORKSPACE_DIAGNOSTIC_TRACE_FORMAT,
  type CompilerFixtureProjectionAuthority,
  type IssueWorkspaceDiagnosticProjectionReceiptInput,
  type WorkspaceDiagnosticCompilerTarget,
  type WorkspaceDiagnosticProjectionFinding,
  type WorkspaceDiagnosticProjectionReceipt,
  type WorkspaceDiagnosticTrace,
  type WorkspaceDiagnosticTraceEntry,
} from './workspaceDiagnosticProjection.types';
import { assertWorkspaceDiagnosticProjectionReceiptMatches } from './workspaceDiagnosticProjectionReceiptValidation';
import { runWorkspaceDiagnostics } from './workspaceDiagnosticRunner';
import { resolveWorkspaceDiagnosticSnapshotLineage } from './workspaceDiagnosticSnapshotLineage';

export {
  WORKSPACE_DIAGNOSTIC_PROJECTION_RECEIPT_FORMAT,
  WORKSPACE_DIAGNOSTIC_TRACE_FORMAT,
};
export type {
  CompilerFixtureProjectionAuthority,
  IssueWorkspaceDiagnosticProjectionReceiptInput,
  WorkspaceDiagnosticCompilerTarget,
  WorkspaceDiagnosticProjectionFinding,
  WorkspaceDiagnosticProjectionReceipt,
  WorkspaceDiagnosticTrace,
  WorkspaceDiagnosticTraceEntry,
};

/**
 * Runs Workspace/Semantic/Compiler-owned diagnostics and issues a receipt only
 * after the exact final snapshot can be reversed through every allowlisted,
 * owner-receipted test extension to the freshly compiled base snapshot.
 */
export const issueWorkspaceDiagnosticProjectionReceipt = (
  input: IssueWorkspaceDiagnosticProjectionReceiptInput
): WorkspaceDiagnosticProjectionReceipt => {
  const { compiled, compilerBase, snapshot, lineage } =
    resolveWorkspaceDiagnosticSnapshotLineage(input);
  const diagnostics = runWorkspaceDiagnostics({
    workspace: input.workspace,
    snapshot,
    compilerDiagnostics: compiled.diagnostics,
  });
  const withoutDigest = Object.freeze({
    format: WORKSPACE_DIAGNOSTIC_PROJECTION_RECEIPT_FORMAT,
    owner: WORKSPACE_DIAGNOSTIC_COMPILER_OWNER,
    workspaceSnapshotDigest: digestCompilerValue(input.workspace),
    semanticIndexDigest: diagnostics.semanticIndexDigest,
    compilerBaseSnapshotDigest: compilerBase.contentDigest,
    compilerProjectionDigest: snapshot.contentDigest,
    target: snapshot.target,
    lineage,
    diagnosticRuns: diagnostics.diagnosticRuns,
    findings: diagnostics.findings,
    trace: diagnostics.trace,
  });
  return Object.freeze({
    ...withoutDigest,
    receiptDigest: digestCompilerValue(withoutDigest),
  });
};

export const assertWorkspaceDiagnosticProjectionReceipt = (
  receipt: WorkspaceDiagnosticProjectionReceipt,
  input: IssueWorkspaceDiagnosticProjectionReceiptInput
): void => {
  assertWorkspaceDiagnosticProjectionReceiptMatches(
    receipt,
    issueWorkspaceDiagnosticProjectionReceipt(input)
  );
};
