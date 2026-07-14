import {
  createWorkspacePirProjectionPlan,
  isWorkspacePirDocument,
  type WorkspacePirProjectionIssue,
  type WorkspacePirDocument,
} from '@prodivix/workspace';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import { mergeExportDependencies } from '#src/export/dependencyPlanner';
import type {
  ExportModule,
  ExportProgramContribution,
} from '#src/export/types';
import { compilePirReactDocument } from '#src/react/documentCompiler';
import {
  createPirReactModuleId,
  createPirReactModuleNames,
} from '#src/react/moduleNaming';
import type {
  CompileWorkspacePirReactModulesInput,
  WorkspacePirReactCompileBlocked,
  WorkspacePirReactCompileResult,
} from '#src/react/compiler.types';

const compareDiagnostics = (
  left: CompileDiagnostic,
  right: CompileDiagnostic
): number =>
  left.path < right.path
    ? -1
    : left.path > right.path
      ? 1
      : left.code < right.code
        ? -1
        : left.code > right.code
          ? 1
          : left.message < right.message
            ? -1
            : left.message > right.message
              ? 1
              : 0;

const toCompileDiagnostic = (
  issue: WorkspacePirProjectionIssue
): CompileDiagnostic => ({
  code: issue.causeCode ?? issue.code,
  severity: 'error',
  source: 'export',
  message: issue.message,
  path: issue.path,
});

const blockedResult = (
  graph: WorkspacePirReactCompileBlocked['graph'],
  diagnostics: readonly CompileDiagnostic[]
): WorkspacePirReactCompileBlocked => {
  const stableDiagnostics = [...diagnostics].sort(compareDiagnostics);
  const modules: ExportModule[] = [];
  const contribution: ExportProgramContribution = {
    modules,
    diagnostics: stableDiagnostics,
  };
  return {
    status: 'blocked',
    graph,
    diagnostics: stableDiagnostics,
    modules,
    contribution,
  };
};

/** Compiles the PIR projection reachable from one Workspace entry. */
export const compileWorkspacePirReactModules = (
  input: CompileWorkspacePirReactModulesInput
): WorkspacePirReactCompileResult => {
  const projection = createWorkspacePirProjectionPlan({
    workspace: input.workspace,
    entryDocumentId: input.entryDocumentId,
  });
  if (projection.status === 'blocked') {
    return blockedResult(
      projection.graph,
      projection.issues.map(toCompileDiagnostic)
    );
  }

  const { plan } = projection;
  const moduleIdByDocumentId = Object.freeze(
    Object.fromEntries(
      plan.dependencyFirstDocumentIds.map((documentId) => [
        documentId,
        createPirReactModuleId(documentId),
      ])
    )
  );
  const allDocumentsById = Object.fromEntries(
    Object.values(input.workspace.docsById)
      .filter(isWorkspacePirDocument)
      .sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0
      )
      .map((document) => [document.id, document])
  ) as Readonly<Record<string, WorkspacePirDocument>>;
  const workspaceModuleNameByDocumentId = createPirReactModuleNames(
    Object.keys(allDocumentsById),
    allDocumentsById
  );
  const moduleNameByDocumentId = Object.freeze(
    Object.fromEntries(
      plan.dependencyFirstDocumentIds.map((documentId) => [
        documentId,
        workspaceModuleNameByDocumentId[documentId]!,
      ])
    )
  );
  const compiled = plan.dependencyFirstDocumentIds.map((documentId) =>
    compilePirReactDocument({
      workspaceDocument: plan.documentsById[documentId]!,
      documentsById: plan.documentsById,
      moduleIdByDocumentId,
      moduleNameByDocumentId,
      adapter: input.adapter,
      packageResolver: input.packageResolver,
    })
  );
  const diagnostics = compiled
    .flatMap((document) => document.diagnostics)
    .sort(compareDiagnostics);
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return blockedResult(plan.graph, diagnostics);
  }

  const modules = compiled.map((document) => document.module);
  const contribution: ExportProgramContribution = {
    entryModuleId: moduleIdByDocumentId[plan.entryDocumentId],
    roots: compiled.map((document) => document.root),
    modules,
    dependencies: mergeExportDependencies(
      compiled.flatMap((document) => document.dependencies)
    ),
    diagnostics,
    metadata: {
      pirProjection: {
        snapshotIdentity: plan.snapshotIdentity,
        entryDocumentId: plan.entryDocumentId,
        dependencyFirstDocumentIds: plan.dependencyFirstDocumentIds,
        componentDocumentIds: plan.componentDocumentIds,
        moduleIdByDocumentId,
      },
    },
  };
  return {
    status: 'ready',
    snapshotIdentity: plan.snapshotIdentity,
    graph: plan.graph,
    diagnostics,
    dependencyFirstDocumentIds: plan.dependencyFirstDocumentIds,
    componentDocumentIds: plan.componentDocumentIds,
    moduleIdByDocumentId,
    moduleNameByDocumentId,
    modules,
    contribution,
  };
};
