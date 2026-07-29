import type { ProdivixDiagnostic } from '@prodivix/diagnostics';
import type {
  ExecutableProjectFile,
  ExecutableProjectSnapshot,
  ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  createWorkspaceSemanticIndexFromSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import { digestCompilerValue } from './executableProjectSnapshotCanonical';
import { collectWorkspaceManifestDiagnostics } from './workspaceDiagnosticManifestDiagnostics';
import {
  WORKSPACE_DIAGNOSTIC_TRACE_FORMAT,
  type WorkspaceDiagnosticOwnerDiagnostic,
  type WorkspaceDiagnosticProjectionFinding,
  type WorkspaceDiagnosticProjectionReceipt,
  type WorkspaceDiagnosticRunBinding,
  type WorkspaceDiagnosticTrace,
} from './workspaceDiagnosticProjection.types';

export type WorkspaceDiagnosticRunResult = Readonly<{
  semanticIndexDigest: string;
  diagnosticRuns: WorkspaceDiagnosticProjectionReceipt['diagnosticRuns'];
  findings: readonly WorkspaceDiagnosticProjectionFinding[];
  trace: WorkspaceDiagnosticTrace;
}>;

const FINDING_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

const canonicalToken = (value: string, label: string): string => {
  if (!FINDING_TOKEN_PATTERN.test(value)) {
    throw new TypeError(`${label} is not a canonical diagnostic identifier.`);
  }
  return value;
};

const semanticOwnerDiagnostics = (
  diagnostics: readonly ProdivixDiagnostic[]
): readonly WorkspaceDiagnosticOwnerDiagnostic[] =>
  Object.freeze(
    diagnostics.map((diagnostic) =>
      Object.freeze({
        category: 'semantic' as const,
        code: canonicalToken(diagnostic.code, 'Semantic diagnostic code'),
        severity: diagnostic.severity,
        message: diagnostic.message,
        ...(diagnostic.targetRef ? { targetRef: diagnostic.targetRef } : {}),
      })
    )
  );

const compilerOwnerDiagnostics = (
  diagnostics: readonly CompileDiagnostic[]
): readonly WorkspaceDiagnosticOwnerDiagnostic[] =>
  Object.freeze(
    diagnostics.map((diagnostic) =>
      Object.freeze({
        category: 'compiler' as const,
        code: canonicalToken(diagnostic.code, 'Compiler diagnostic code'),
        severity: diagnostic.severity,
        message: diagnostic.message,
        path: diagnostic.path,
      })
    )
  );

const diagnosticRunBinding = (
  diagnostics: readonly WorkspaceDiagnosticOwnerDiagnostic[]
): WorkspaceDiagnosticRunBinding =>
  Object.freeze({
    diagnosticCount: diagnostics.length,
    diagnosticsDigest: digestCompilerValue(diagnostics),
  });

const traceForSnapshot = (
  snapshot: ExecutableProjectSnapshot
): WorkspaceDiagnosticTrace => {
  const entries = Object.freeze(
    snapshot.files
      .flatMap((file) =>
        file.sourceTrace?.length
          ? [
              Object.freeze({
                path: file.path,
                sourceTrace: Object.freeze(
                  file.sourceTrace.map((trace) => Object.freeze(trace))
                ),
              }),
            ]
          : []
      )
      .sort((left, right) => compareUnicodeCodePoints(left.path, right.path))
  );
  if (entries.length === 0) {
    throw new TypeError(
      'Diagnostic projection requires at least one real owner SourceTrace.'
    );
  }
  const withoutDigest = Object.freeze({
    format: WORKSPACE_DIAGNOSTIC_TRACE_FORMAT,
    traceKind: 'diagnostics' as const,
    subjectDigest: snapshot.contentDigest,
    entries,
  });
  return Object.freeze({
    ...withoutDigest,
    traceDigest: digestCompilerValue(withoutDigest),
  });
};

const sourceTraceForDiagnostic = (
  diagnostic: WorkspaceDiagnosticOwnerDiagnostic,
  filesByPath: ReadonlyMap<string, ExecutableProjectFile>
): readonly ExecutionSourceTrace[] | undefined => {
  if (!diagnostic.path) return undefined;
  const file = filesByPath.get(diagnostic.path);
  return file?.sourceTrace?.length ? file.sourceTrace : undefined;
};

const findingIdentity = (
  finding: WorkspaceDiagnosticProjectionFinding
): string =>
  [
    finding.ruleId,
    finding.targetId,
    finding.messageKey,
    finding.severity,
    finding.sourceTraceDigest ?? '',
  ].join('\u0000');

const normalizeFindings = (
  diagnostics: readonly WorkspaceDiagnosticOwnerDiagnostic[],
  snapshot: ExecutableProjectSnapshot,
  workspace: WorkspaceSnapshot
): readonly WorkspaceDiagnosticProjectionFinding[] => {
  const filesByPath = new Map(
    snapshot.files.map((file) => [file.path, file] as const)
  );
  const grouped = new Map<
    string,
    {
      ruleId: string;
      severity: WorkspaceDiagnosticProjectionFinding['severity'];
      targetId: string;
      messageKey: string;
      count: number;
      diagnosticCodes: Set<string>;
      sourceTraceDigest?: string;
    }
  >();
  for (const diagnostic of diagnostics) {
    const sourceTrace = sourceTraceForDiagnostic(diagnostic, filesByPath);
    const sourceTraceDigest = sourceTrace
      ? digestCompilerValue(sourceTrace)
      : undefined;
    const ruleId = canonicalToken(
      `${diagnostic.category}.${diagnostic.code}`,
      'Diagnostic finding ruleId'
    );
    const messageKey = canonicalToken(
      `diagnostic.${diagnostic.code}`,
      'Diagnostic finding messageKey'
    );
    const targetId = `${diagnostic.category}:${digestCompilerValue({
      workspaceId: workspace.id,
      path: diagnostic.path ?? null,
      targetRef: diagnostic.targetRef ?? null,
    }).slice('sha256-'.length)}`;
    const identity = [
      ruleId,
      targetId,
      messageKey,
      diagnostic.severity,
      sourceTraceDigest ?? '',
    ].join('\u0000');
    const existing = grouped.get(identity);
    if (existing) {
      existing.count += 1;
      existing.diagnosticCodes.add(diagnostic.code);
    } else {
      grouped.set(identity, {
        ruleId,
        severity: diagnostic.severity,
        targetId,
        messageKey,
        count: 1,
        diagnosticCodes: new Set([diagnostic.code]),
        ...(sourceTraceDigest ? { sourceTraceDigest } : {}),
      });
    }
  }
  return Object.freeze(
    [...grouped.values()]
      .map((finding) =>
        Object.freeze({
          ruleId: finding.ruleId,
          severity: finding.severity,
          targetId: finding.targetId,
          messageKey: finding.messageKey,
          count: finding.count,
          diagnosticCodes: Object.freeze(
            [...finding.diagnosticCodes].sort(compareUnicodeCodePoints)
          ),
          ...(finding.sourceTraceDigest
            ? { sourceTraceDigest: finding.sourceTraceDigest }
            : {}),
        })
      )
      .sort((left, right) =>
        compareUnicodeCodePoints(findingIdentity(left), findingIdentity(right))
      )
  );
};

export const runWorkspaceDiagnostics = (input: {
  workspace: WorkspaceSnapshot;
  snapshot: ExecutableProjectSnapshot;
  compilerDiagnostics: readonly CompileDiagnostic[];
}): WorkspaceDiagnosticRunResult => {
  const semantic = createWorkspaceSemanticIndexFromSnapshot(input.workspace);
  if (semantic.status !== 'ready') {
    throw new TypeError(
      `Workspace diagnostic Semantic Index is blocked: ${semantic.issues
        .map(({ code }) => code)
        .join(', ')}.`
    );
  }
  const semanticResult = semantic.index.getSemanticDiagnostics();
  if (semanticResult.status !== 'resolved') {
    throw new TypeError(
      'Workspace diagnostic Semantic Index did not resolve its exact snapshot.'
    );
  }

  const semanticDiagnostics = semanticOwnerDiagnostics(
    semanticResult.diagnostics
  );
  const compilerDiagnostics = compilerOwnerDiagnostics(
    input.compilerDiagnostics
  );
  const manifestDiagnostics = collectWorkspaceManifestDiagnostics(
    input.workspace,
    input.snapshot
  );
  const allDiagnostics = Object.freeze([
    ...semanticDiagnostics,
    ...compilerDiagnostics,
    ...manifestDiagnostics.path,
    ...manifestDiagnostics.schema,
    ...manifestDiagnostics.reference,
    ...manifestDiagnostics.imports,
    ...manifestDiagnostics.dependency,
  ]);

  return Object.freeze({
    semanticIndexDigest: digestCompilerValue(semantic.index.snapshotIdentity),
    diagnosticRuns: Object.freeze({
      semantic: diagnosticRunBinding(semanticDiagnostics),
      compiler: diagnosticRunBinding(compilerDiagnostics),
      path: diagnosticRunBinding(manifestDiagnostics.path),
      schema: diagnosticRunBinding(manifestDiagnostics.schema),
      reference: diagnosticRunBinding(manifestDiagnostics.reference),
      imports: diagnosticRunBinding(manifestDiagnostics.imports),
      dependency: diagnosticRunBinding(manifestDiagnostics.dependency),
    }),
    findings: normalizeFindings(
      allDiagnostics,
      input.snapshot,
      input.workspace
    ),
    trace: traceForSnapshot(input.snapshot),
  });
};
