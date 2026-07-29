import type { DiagnosticTargetRef } from '@prodivix/diagnostics';
import {
  normalizeExecutableProjectPath,
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectFile,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import ts from 'typescript';
import type {
  WorkspaceDiagnosticOwnerCategory,
  WorkspaceDiagnosticOwnerDiagnostic,
} from './workspaceDiagnosticProjection.types';

export type WorkspaceManifestDiagnosticRuns = Readonly<{
  path: readonly WorkspaceDiagnosticOwnerDiagnostic[];
  schema: readonly WorkspaceDiagnosticOwnerDiagnostic[];
  reference: readonly WorkspaceDiagnosticOwnerDiagnostic[];
  imports: readonly WorkspaceDiagnosticOwnerDiagnostic[];
  dependency: readonly WorkspaceDiagnosticOwnerDiagnostic[];
}>;

const textContents = (file: ExecutableProjectFile): string | undefined => {
  if (typeof file.contents === 'string') return file.contents;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(file.contents);
  } catch {
    return undefined;
  }
};

const manifestDiagnostic = (
  category: Exclude<WorkspaceDiagnosticOwnerCategory, 'semantic' | 'compiler'>,
  code: string,
  message: string,
  path?: string
): WorkspaceDiagnosticOwnerDiagnostic =>
  Object.freeze({
    category,
    code,
    severity: 'error' as const,
    message,
    ...(path ? { path } : {}),
  });

const collectPathDiagnostics = (
  snapshot: ExecutableProjectSnapshot
): readonly WorkspaceDiagnosticOwnerDiagnostic[] => {
  const diagnostics: WorkspaceDiagnosticOwnerDiagnostic[] = [];
  let previous = '';
  for (const file of snapshot.files) {
    const path = normalizeExecutableProjectPath(file.path);
    if (
      path !== file.path ||
      (previous && compareUnicodeCodePoints(previous, path) >= 0)
    ) {
      diagnostics.push(
        manifestDiagnostic(
          'path',
          'WKS-DIAGNOSTIC-PATH-INVALID',
          'Executable manifest path is unsafe, non-canonical, duplicated, or unsorted.',
          file.path
        )
      );
    }
    previous = path;
  }
  return Object.freeze(diagnostics);
};

const scriptKindFor = (path: string): ts.ScriptKind => {
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (path.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
};

const isScriptPath = (path: string): boolean =>
  /\.(?:[cm]?[jt]sx?)$/u.test(path);

const collectSchemaDiagnostics = (
  snapshot: ExecutableProjectSnapshot
): readonly WorkspaceDiagnosticOwnerDiagnostic[] => {
  const diagnostics: WorkspaceDiagnosticOwnerDiagnostic[] = [];
  for (const file of snapshot.files) {
    if (!file.path.endsWith('.json') && !isScriptPath(file.path)) continue;
    const text = textContents(file);
    if (text === undefined) {
      diagnostics.push(
        manifestDiagnostic(
          'schema',
          'WKS-DIAGNOSTIC-TEXT-DECODE-INVALID',
          'Executable source could not be decoded as UTF-8.',
          file.path
        )
      );
      continue;
    }
    if (file.path.endsWith('.json')) {
      try {
        JSON.parse(text);
      } catch {
        diagnostics.push(
          manifestDiagnostic(
            'schema',
            'WKS-DIAGNOSTIC-JSON-SCHEMA-INVALID',
            'Executable JSON source is not syntactically valid.',
            file.path
          )
        );
      }
      continue;
    }
    const source = ts.createSourceFile(
      file.path,
      text,
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(file.path)
    );
    const parseDiagnostics = (
      source as ts.SourceFile & {
        parseDiagnostics?: readonly ts.Diagnostic[];
      }
    ).parseDiagnostics;
    for (const diagnostic of parseDiagnostics ?? []) {
      diagnostics.push(
        manifestDiagnostic(
          'schema',
          'WKS-DIAGNOSTIC-SOURCE-SYNTAX-INVALID',
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          file.path
        )
      );
    }
  }
  return Object.freeze(diagnostics);
};

const documentIdForTarget = (
  target: DiagnosticTargetRef
): string | undefined => {
  switch (target.kind) {
    case 'document':
    case 'pir-node':
    case 'inspector-field':
    case 'nodegraph-node':
    case 'nodegraph-port':
    case 'animation-timeline':
    case 'animation-track':
    case 'data-source':
    case 'data-operation':
    case 'behavior-scenario':
    case 'behavior-step':
    case 'verification-policy':
    case 'component-slot':
      return target.documentId;
    default:
      return undefined;
  }
};

const collectReferenceDiagnostics = (
  workspace: WorkspaceSnapshot,
  snapshot: ExecutableProjectSnapshot
): readonly WorkspaceDiagnosticOwnerDiagnostic[] => {
  const diagnostics: WorkspaceDiagnosticOwnerDiagnostic[] = [];
  const files = new Set(snapshot.files.map(({ path }) => path));
  for (const entrypoint of snapshot.entrypoints) {
    if (!files.has(entrypoint.path)) {
      diagnostics.push(
        manifestDiagnostic(
          'reference',
          'WKS-DIAGNOSTIC-ENTRYPOINT-MISSING',
          'Executable entrypoint does not resolve to an exact manifest file.',
          entrypoint.path
        )
      );
    }
  }
  for (const dependencyPath of [
    snapshot.dependencyPlan.manifestFilePath,
    snapshot.dependencyPlan.lockFilePath,
  ]) {
    if (dependencyPath && !files.has(dependencyPath)) {
      diagnostics.push(
        manifestDiagnostic(
          'reference',
          'WKS-DIAGNOSTIC-DEPENDENCY-FILE-MISSING',
          'Executable dependency plan does not resolve to an exact manifest file.',
          dependencyPath
        )
      );
    }
  }
  for (const file of snapshot.files) {
    if (!file.sourceTrace?.length) {
      diagnostics.push(
        manifestDiagnostic(
          'reference',
          'WKS-DIAGNOSTIC-SOURCE-TRACE-MISSING',
          'Executable source has no owner-derived SourceTrace.',
          file.path
        )
      );
      continue;
    }
    for (const trace of file.sourceTrace) {
      const ref = trace.sourceRef;
      if (
        (ref.kind === 'workspace' && ref.workspaceId !== workspace.id) ||
        (ref.kind === 'workspace-node' && ref.workspaceId !== workspace.id) ||
        (ref.kind === 'document' &&
          ((ref.workspaceId !== undefined &&
            ref.workspaceId !== workspace.id) ||
            !workspace.docsById[ref.documentId]))
      ) {
        diagnostics.push(
          manifestDiagnostic(
            'reference',
            'WKS-DIAGNOSTIC-SOURCE-REF-INVALID',
            'Executable SourceTrace does not resolve against the exact Workspace snapshot.',
            file.path
          )
        );
        continue;
      }
      const documentId = documentIdForTarget(ref);
      if (documentId && !workspace.docsById[documentId]) {
        diagnostics.push(
          manifestDiagnostic(
            'reference',
            'WKS-DIAGNOSTIC-SOURCE-REF-INVALID',
            'Executable SourceTrace document does not exist in the exact Workspace snapshot.',
            file.path
          )
        );
      }
    }
  }
  return Object.freeze(diagnostics);
};

const importedSpecifiers = (file: ExecutableProjectFile): readonly string[] => {
  const text = textContents(file);
  if (text === undefined) return Object.freeze([]);
  const specifiers =
    isScriptPath(file.path) || file.path.endsWith('.vue')
      ? ts
          .preProcessFile(text, true, true)
          .importedFiles.map(({ fileName }) => fileName)
      : file.path.endsWith('.css') || file.path.endsWith('.scss')
        ? Array.from(
            text.matchAll(
              /@(?:import|use|forward)\s+(?:url\()?['"]([^'"]+)['"]/gu
            ),
            (match) => match[1]!
          )
        : [];
  return Object.freeze([...new Set(specifiers)].sort(compareUnicodeCodePoints));
};

const resolveRelativeImportCandidates = (
  importerPath: string,
  specifier: string
): readonly string[] => {
  const clean = specifier.split(/[?#]/u, 1)[0]!;
  const segments = importerPath.split('/');
  segments.pop();
  for (const part of clean.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (segments.length === 0) return Object.freeze([]);
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  const base = segments.join('/');
  const candidates = new Set<string>([
    base,
    ...[
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.json',
      '.css',
      '.scss',
      '.vue',
    ].map((extension) => `${base}${extension}`),
    ...[
      'index.ts',
      'index.tsx',
      'index.js',
      'index.jsx',
      'index.mjs',
      'index.cjs',
      'index.json',
      'index.css',
      'index.scss',
      'index.vue',
    ].map((entry) => `${base}/${entry}`),
  ]);
  if (/\.[cm]?js$/u.test(base)) {
    const withoutJavaScript = base.replace(/\.[cm]?js$/u, '');
    candidates.add(`${withoutJavaScript}.ts`);
    candidates.add(`${withoutJavaScript}.tsx`);
  }
  return Object.freeze([...candidates]);
};

const packageRoot = (specifier: string): string =>
  specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/', 1)[0]!;

const readDeclaredDependencies = (
  snapshot: ExecutableProjectSnapshot
): Readonly<{ dependencies: ReadonlySet<string>; valid: boolean }> => {
  const manifest = snapshot.files.find(
    ({ path }) => path === snapshot.dependencyPlan.manifestFilePath
  );
  const text = manifest ? textContents(manifest) : undefined;
  if (text === undefined) {
    return Object.freeze({ dependencies: new Set<string>(), valid: false });
  }
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    const dependencies = new Set<string>();
    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      const entries = value[field];
      if (entries && typeof entries === 'object' && !Array.isArray(entries)) {
        Object.keys(entries).forEach((name) => dependencies.add(name));
      }
    }
    return Object.freeze({ dependencies, valid: true });
  } catch {
    return Object.freeze({ dependencies: new Set<string>(), valid: false });
  }
};

const collectImportAndDependencyDiagnostics = (
  snapshot: ExecutableProjectSnapshot
): Readonly<{
  imports: readonly WorkspaceDiagnosticOwnerDiagnostic[];
  dependency: readonly WorkspaceDiagnosticOwnerDiagnostic[];
}> => {
  const imports: WorkspaceDiagnosticOwnerDiagnostic[] = [];
  const dependency: WorkspaceDiagnosticOwnerDiagnostic[] = [];
  const paths = new Set(
    projectExecutableProjectRuntimeFiles(snapshot, 'test').map(
      ({ path }) => path
    )
  );
  const declared = readDeclaredDependencies(snapshot);
  if (!declared.valid) {
    dependency.push(
      manifestDiagnostic(
        'dependency',
        'WKS-DIAGNOSTIC-DEPENDENCY-MANIFEST-INVALID',
        'Executable dependency manifest is missing or invalid.',
        snapshot.dependencyPlan.manifestFilePath
      )
    );
  }
  for (const file of snapshot.files) {
    for (const specifier of importedSpecifiers(file)) {
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        const candidates = specifier.startsWith('/')
          ? [specifier.slice(1)]
          : resolveRelativeImportCandidates(file.path, specifier);
        if (!candidates.some((candidate) => paths.has(candidate))) {
          imports.push(
            manifestDiagnostic(
              'imports',
              'WKS-DIAGNOSTIC-IMPORT-UNRESOLVED',
              `Executable source import "${specifier}" does not resolve inside the exact manifest.`,
              file.path
            )
          );
        }
        continue;
      }
      if (
        specifier.startsWith('node:') ||
        specifier.startsWith('data:') ||
        specifier.startsWith('virtual:')
      ) {
        continue;
      }
      const root = packageRoot(specifier);
      if (!declared.dependencies.has(root)) {
        dependency.push(
          manifestDiagnostic(
            'dependency',
            'WKS-DIAGNOSTIC-DEPENDENCY-UNDECLARED',
            `Executable source package import "${specifier}" is not declared by the exact dependency manifest.`,
            file.path
          )
        );
      }
    }
  }
  return Object.freeze({
    imports: Object.freeze(imports),
    dependency: Object.freeze(dependency),
  });
};

export const collectWorkspaceManifestDiagnostics = (
  workspace: WorkspaceSnapshot,
  snapshot: ExecutableProjectSnapshot
): WorkspaceManifestDiagnosticRuns => {
  const importAndDependency = collectImportAndDependencyDiagnostics(snapshot);
  return Object.freeze({
    path: collectPathDiagnostics(snapshot),
    schema: collectSchemaDiagnostics(snapshot),
    reference: collectReferenceDiagnostics(workspace, snapshot),
    imports: importAndDependency.imports,
    dependency: importAndDependency.dependency,
  });
};
