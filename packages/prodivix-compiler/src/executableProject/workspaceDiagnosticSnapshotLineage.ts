import {
  createExecutableProjectSnapshot,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import {
  generateWorkspaceReactViteExecutableProject,
  type WorkspaceExecutableProjectResult,
} from './workspaceExecutableProject';
import {
  generateWorkspaceVueViteExecutableProject,
  type WorkspaceVueViteExecutableProjectResult,
} from './workspaceVueExecutableProject';
import {
  COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
  assertCompilerFixtureProjectionReceipt,
  createCompilerFixtureProjectionSnapshot,
} from './fixtureProjectionReceipt';
import { assertCompilerDiagnosticTestExtensionReceipt } from './diagnosticTestExtensionReceipt';
import {
  assertSameExecutableProjectSnapshot,
  canonicalExecutableProjectSnapshot,
  digestCompilerValue,
  executableProjectSnapshotInput,
} from './executableProjectSnapshotCanonical';
import type {
  CompilerFixtureProjectionAuthority,
  IssueWorkspaceDiagnosticProjectionReceiptInput,
  WorkspaceDiagnosticCompilerTarget,
  WorkspaceDiagnosticSnapshotLineage,
} from './workspaceDiagnosticProjection.types';

export type WorkspaceDiagnosticCompilerReadyResult = Extract<
  WorkspaceExecutableProjectResult | WorkspaceVueViteExecutableProjectResult,
  Readonly<{ status: 'ready' }>
>;

export type WorkspaceDiagnosticSnapshotLineageResolution = Readonly<{
  compiled: WorkspaceDiagnosticCompilerReadyResult;
  compilerBase: ExecutableProjectSnapshot;
  snapshot: ExecutableProjectSnapshot;
  lineage: WorkspaceDiagnosticSnapshotLineage;
}>;

const compileExactWorkspace = (
  input: IssueWorkspaceDiagnosticProjectionReceiptInput['workspace'],
  target: WorkspaceDiagnosticCompilerTarget
): WorkspaceDiagnosticCompilerReadyResult => {
  const result =
    target.presetId === 'react-vite'
      ? generateWorkspaceReactViteExecutableProject(input, target.options ?? {})
      : generateWorkspaceVueViteExecutableProject(input, target.options ?? {});
  if (result.status === 'blocked') {
    throw new TypeError(
      `Workspace diagnostics cannot bind a blocked Compiler projection: ${result.diagnostics
        .map(({ code }) => code)
        .join(', ')}.`
    );
  }
  if (result.snapshot.target.presetId !== target.presetId) {
    throw new TypeError('Workspace diagnostic Compiler target drifted.');
  }
  return result;
};

const snapshotWithoutPaths = (
  snapshot: ExecutableProjectSnapshot,
  filePaths: readonly string[],
  entrypoints: readonly Readonly<{ kind: string; path: string }>[]
): ExecutableProjectSnapshot => {
  const pathSet = new Set(filePaths);
  const entrypointSet = new Set(
    entrypoints.map(({ kind, path }) => `${kind}\u0000${path}`)
  );
  if (
    pathSet.size !== filePaths.length ||
    filePaths.some(
      (path) => !snapshot.files.some((file) => file.path === path)
    ) ||
    entrypointSet.size !== entrypoints.length ||
    entrypoints.some(
      ({ kind, path }) =>
        !snapshot.entrypoints.some(
          (entrypoint) => entrypoint.kind === kind && entrypoint.path === path
        )
    )
  ) {
    throw new TypeError(
      'Diagnostic snapshot lineage is missing an extension receipt member.'
    );
  }
  return createExecutableProjectSnapshot(
    executableProjectSnapshotInput(
      snapshot,
      Object.freeze(snapshot.files.filter(({ path }) => !pathSet.has(path))),
      Object.freeze(
        snapshot.entrypoints.filter(
          ({ kind, path }) => !entrypointSet.has(`${kind}\u0000${path}`)
        )
      )
    )
  );
};

const verifyFixtureProjectionLineage = (
  snapshot: ExecutableProjectSnapshot,
  authority: CompilerFixtureProjectionAuthority
): ExecutableProjectSnapshot => {
  assertCompilerFixtureProjectionReceipt(authority.receipt, {
    snapshot,
    fixtureSets: authority.fixtureSets,
    controlProfile: authority.controlProfile,
    generatedFiles: authority.generatedFiles,
    buildBundle: authority.buildBundle,
  });
  if (authority.receipt.snapshotDigest !== snapshot.contentDigest) {
    throw new TypeError(
      'Fixture projection authority is not bound to the final diagnostic snapshot.'
    );
  }
  const base = snapshotWithoutPaths(
    snapshot,
    [COMPILER_FIXTURE_PROJECTION_SOURCE_PATH],
    []
  );
  const expected = createCompilerFixtureProjectionSnapshot({
    snapshot: base,
    fixtureSets: authority.fixtureSets,
    controlProfile: authority.controlProfile,
  });
  assertSameExecutableProjectSnapshot(
    snapshot,
    expected,
    'Fixture projection diagnostic lineage'
  );
  return base;
};

const verifySnapshotLineage = (
  compilerBase: ExecutableProjectSnapshot,
  finalSnapshot: ExecutableProjectSnapshot,
  testReceipts: NonNullable<
    IssueWorkspaceDiagnosticProjectionReceiptInput['testExtensionReceipts']
  >,
  fixtureAuthority: CompilerFixtureProjectionAuthority | undefined
): WorkspaceDiagnosticSnapshotLineage => {
  let cursor = finalSnapshot;
  if (fixtureAuthority) {
    cursor = verifyFixtureProjectionLineage(cursor, fixtureAuthority);
  }
  const seenReceipts = new Set<string>();
  for (const receipt of [...testReceipts].reverse()) {
    if (
      seenReceipts.has(receipt.receiptDigest) ||
      receipt.snapshotDigest !== cursor.contentDigest
    ) {
      throw new TypeError(
        'Diagnostic test extension receipt order or identity drifted.'
      );
    }
    seenReceipts.add(receipt.receiptDigest);
    const base = snapshotWithoutPaths(
      cursor,
      receipt.files.map(({ path }) => path),
      receipt.entrypoints
    );
    assertCompilerDiagnosticTestExtensionReceipt(receipt, base, cursor);
    cursor = base;
  }
  assertSameExecutableProjectSnapshot(
    cursor,
    compilerBase,
    'Diagnostic snapshot lineage base'
  );
  const testExtensionReceiptDigests = Object.freeze(
    testReceipts.map(({ receiptDigest }) => receiptDigest)
  );
  const fixtureProjectionReceiptDigest =
    fixtureAuthority?.receipt.receiptDigest ?? null;
  const lineageValue = Object.freeze({
    compilerBaseSnapshotDigest: compilerBase.contentDigest,
    finalSnapshotDigest: finalSnapshot.contentDigest,
    testExtensionReceiptDigests,
    fixtureProjectionReceiptDigest,
  });
  return Object.freeze({
    testExtensionReceiptDigests,
    fixtureProjectionReceiptDigest,
    lineageDigest: digestCompilerValue(lineageValue),
  });
};

export const resolveWorkspaceDiagnosticSnapshotLineage = (
  input: IssueWorkspaceDiagnosticProjectionReceiptInput
): WorkspaceDiagnosticSnapshotLineageResolution => {
  const snapshot = canonicalExecutableProjectSnapshot(
    input.snapshot,
    'Workspace diagnostic final snapshot'
  );
  const compiled = compileExactWorkspace(input.workspace, input.compiler);
  const compilerBase = canonicalExecutableProjectSnapshot(
    compiled.snapshot,
    'Workspace diagnostic Compiler base snapshot'
  );
  const lineage = verifySnapshotLineage(
    compilerBase,
    snapshot,
    Object.freeze([...(input.testExtensionReceipts ?? [])]),
    input.fixtureProjectionAuthority
  );
  return Object.freeze({ compiled, compilerBase, snapshot, lineage });
};
