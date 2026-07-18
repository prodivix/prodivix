import ts from 'typescript';
import type {
  ExecutableProjectFile,
  ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import {
  isWorkspaceCodeDocumentContent,
  type WorkspaceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

export const ISOLATED_SERVER_FUNCTION_IMPORT_GRAPH_MAX_MODULES = 128;
export const ISOLATED_SERVER_FUNCTION_IMPORT_GRAPH_MAX_DEPTH = 64;
export const ISOLATED_SERVER_FUNCTION_IMPORT_GRAPH_MAX_SOURCE_BYTES =
  4 * 1024 * 1024;

type StaticImport = Readonly<{
  specifier: string;
  start: number;
  end: number;
  targetDocumentId: string;
}>;

type GraphModule = Readonly<{
  document: WorkspaceDocument;
  language: 'ts' | 'js';
  source: string;
  imports: readonly StaticImport[];
}>;

export type IsolatedServerFunctionImportGraphResult =
  | Readonly<{
      status: 'ready';
      files: readonly ExecutableProjectFile[];
      moduleDocumentIds: readonly string[];
    }>
  | Readonly<{
      status: 'blocked';
      message: string;
      documentPath: string;
    }>;

type GraphFailure = Readonly<{ message: string; documentPath: string }>;

const utf8Bytes = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const canonicalDocumentPath = (value: string): string | undefined => {
  if (
    !value.startsWith('/') ||
    value === '/' ||
    value.includes('\\') ||
    value.includes('\0')
  )
    return undefined;
  const segments = value.slice(1).split('/');
  return segments.some(
    (segment) => !segment || segment === '.' || segment === '..'
  )
    ? undefined
    : `/${segments.join('/')}`;
};

const resolveRelativePath = (
  importerPath: string,
  specifier: string
): string | undefined => {
  if (
    (!specifier.startsWith('./') && !specifier.startsWith('../')) ||
    specifier.includes('\\') ||
    specifier.includes('\0') ||
    specifier.includes('?') ||
    specifier.includes('#') ||
    specifier.length > 2_048
  )
    return undefined;
  const segments = importerPath.slice(1).split('/');
  segments.pop();
  for (const segment of specifier.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!segments.length) return undefined;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length ? `/${segments.join('/')}` : undefined;
};

const pathExtension = (path: string): string | undefined => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : undefined;
};

const candidateImportPaths = (basePath: string): readonly string[] => {
  const extension = pathExtension(basePath);
  if (extension === '.js') {
    return Object.freeze([basePath, `${basePath.slice(0, -3)}.ts`]);
  }
  if (extension) return Object.freeze([basePath]);
  return Object.freeze([
    basePath,
    `${basePath}.ts`,
    `${basePath}.js`,
    `${basePath}/index.ts`,
    `${basePath}/index.js`,
  ]);
};

const indexWorkspaceDocumentsByPath = (
  workspace: WorkspaceSnapshot
): ReadonlyMap<string, readonly WorkspaceDocument[]> => {
  const mutable = new Map<string, WorkspaceDocument[]>();
  for (const document of Object.values(workspace.docsById)) {
    const path = canonicalDocumentPath(document.path);
    if (!path) continue;
    const documents = mutable.get(path) ?? [];
    documents.push(document);
    mutable.set(path, documents);
  }
  return new Map(
    [...mutable].map(([path, documents]) => [
      path,
      Object.freeze(
        documents.sort((left, right) => compareText(left.id, right.id))
      ),
    ])
  );
};

const resolveImportDocument = (
  documentsByPath: ReadonlyMap<string, readonly WorkspaceDocument[]>,
  importerPath: string,
  specifier: string
):
  | Readonly<{ status: 'resolved'; document: WorkspaceDocument }>
  | Readonly<{ status: 'blocked'; message: string }> => {
  const basePath = resolveRelativePath(importerPath, specifier);
  if (!basePath)
    return Object.freeze({
      status: 'blocked',
      message: `Import ${JSON.stringify(specifier)} is not a canonical relative Workspace path.`,
    });
  const matches = candidateImportPaths(basePath).flatMap(
    (candidate) => documentsByPath.get(candidate) ?? []
  );
  const unique = [
    ...new Map(matches.map((document) => [document.id, document])).values(),
  ];
  if (!unique.length)
    return Object.freeze({
      status: 'blocked',
      message: `Import ${JSON.stringify(specifier)} does not resolve to a canonical Workspace document.`,
    });
  if (unique.length !== 1)
    return Object.freeze({
      status: 'blocked',
      message: `Import ${JSON.stringify(specifier)} resolves ambiguously in the canonical Workspace.`,
    });
  return Object.freeze({ status: 'resolved', document: unique[0]! });
};

type ParsedStaticImport = Readonly<{
  specifier: string;
  start: number;
  end: number;
}>;

const parseStaticImports = (
  source: string,
  language: 'ts' | 'js',
  documentPath: string
):
  | Readonly<{ status: 'ready'; imports: readonly ParsedStaticImport[] }>
  | Readonly<{ status: 'blocked'; message: string }> => {
  const preprocessed = ts.preProcessFile(source, true, true);
  if (
    preprocessed.referencedFiles.length ||
    preprocessed.typeReferenceDirectives.length ||
    preprocessed.libReferenceDirectives.length
  )
    return Object.freeze({
      status: 'blocked',
      message:
        'Isolated Server Function modules cannot use triple-slash path, type, or lib references.',
    });
  const sourceFile = ts.createSourceFile(
    documentPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    language === 'ts' ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );
  const imports: ParsedStaticImport[] = [];
  let unsupported: string | undefined;
  const visit = (node: ts.Node): void => {
    if (unsupported) return;
    if (ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node)) {
      unsupported =
        'Isolated Server Function modules accept only static ESM import/export declarations.';
      return;
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      unsupported =
        'Dynamic import and CommonJS require are not allowed in the isolated import graph.';
      return;
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.attributes) {
        unsupported =
          'Import attributes are not supported by the isolated import graph.';
        return;
      }
      const moduleSpecifier = node.moduleSpecifier;
      if (moduleSpecifier) {
        if (!ts.isStringLiteralLike(moduleSpecifier)) {
          unsupported = 'Isolated module specifiers must be string literals.';
          return;
        }
        imports.push(
          Object.freeze({
            specifier: moduleSpecifier.text,
            start: moduleSpecifier.getStart(sourceFile),
            end: moduleSpecifier.getEnd(),
          })
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return unsupported
    ? Object.freeze({ status: 'blocked', message: unsupported })
    : Object.freeze({
        status: 'ready',
        imports: Object.freeze(
          imports.sort((left, right) => left.start - right.start)
        ),
      });
};

const generatedModuleSpecifier = (fromPath: string, toPath: string): string => {
  const from = fromPath.split('/');
  from.pop();
  const to = toPath.split('/');
  let common = 0;
  while (
    common < from.length &&
    common < to.length &&
    from[common] === to[common]
  )
    common += 1;
  const relative = [
    ...Array.from({ length: from.length - common }, () => '..'),
    ...to.slice(common),
  ].join('/');
  return relative.startsWith('../') ? relative : `./${relative}`;
};

const rewriteStaticImports = (
  source: string,
  imports: readonly StaticImport[],
  generatedPathByDocumentId: ReadonlyMap<string, string>,
  importerGeneratedPath: string
): string => {
  let result = source;
  for (const entry of [...imports].sort(
    (left, right) => right.start - left.start
  )) {
    const targetPath = generatedPathByDocumentId.get(entry.targetDocumentId);
    if (!targetPath)
      throw new TypeError('Isolated import graph target was not projected.');
    result = `${result.slice(0, entry.start)}${JSON.stringify(
      generatedModuleSpecifier(importerGeneratedPath, targetPath)
    )}${result.slice(entry.end)}`;
  }
  return result;
};

const transpileModule = (
  module: GraphModule,
  source: string
): string | undefined => {
  const result = ts.transpileModule(source, {
    fileName: module.document.path,
    reportDiagnostics: true,
    compilerOptions: {
      allowJs: module.language === 'js',
      isolatedModules: true,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      newLine: ts.NewLineKind.LineFeed,
      removeComments: false,
    },
  });
  return result.diagnostics?.some(
    ({ category }) => category === ts.DiagnosticCategory.Error
  )
    ? undefined
    : result.outputText;
};

const moduleSourceTrace = (
  document: WorkspaceDocument
): readonly ExecutionSourceTrace[] =>
  Object.freeze([
    Object.freeze({
      sourceRef: Object.freeze({
        kind: 'code-artifact' as const,
        artifactId: document.id,
      }),
      label: document.path,
    }),
  ]);

/** Resolves and projects one bounded canonical TS/JS graph without package or runtime resolution. */
export const buildWorkspaceIsolatedServerFunctionImportGraph = (
  workspace: WorkspaceSnapshot,
  rootDocumentId: string,
  rootGeneratedPath: string
): IsolatedServerFunctionImportGraphResult => {
  const documentsByPath = indexWorkspaceDocumentsByPath(workspace);
  const modules = new Map<string, GraphModule>();
  const active = new Set<string>();
  let totalSourceBytes = 0;

  const visit = (
    document: WorkspaceDocument,
    depth: number
  ): GraphFailure | undefined => {
    if (active.has(document.id) || modules.has(document.id)) return undefined;
    if (depth > ISOLATED_SERVER_FUNCTION_IMPORT_GRAPH_MAX_DEPTH)
      return Object.freeze({
        message: `Isolated import graph exceeds ${ISOLATED_SERVER_FUNCTION_IMPORT_GRAPH_MAX_DEPTH} levels.`,
        documentPath: document.path,
      });
    if (modules.size >= ISOLATED_SERVER_FUNCTION_IMPORT_GRAPH_MAX_MODULES)
      return Object.freeze({
        message: `Isolated import graph exceeds ${ISOLATED_SERVER_FUNCTION_IMPORT_GRAPH_MAX_MODULES} modules.`,
        documentPath: document.path,
      });
    if (
      document.type !== 'code' ||
      !isWorkspaceCodeDocumentContent(document.content) ||
      (document.content.language !== 'ts' && document.content.language !== 'js')
    )
      return Object.freeze({
        message:
          'Isolated imports must resolve to canonical TypeScript or JavaScript code documents.',
        documentPath: document.path,
      });
    const canonicalPath = canonicalDocumentPath(document.path);
    if (!canonicalPath)
      return Object.freeze({
        message: 'Isolated module document path is not canonical.',
        documentPath: document.path,
      });
    totalSourceBytes += utf8Bytes(document.content.source);
    if (
      totalSourceBytes > ISOLATED_SERVER_FUNCTION_IMPORT_GRAPH_MAX_SOURCE_BYTES
    )
      return Object.freeze({
        message: `Isolated import graph exceeds ${ISOLATED_SERVER_FUNCTION_IMPORT_GRAPH_MAX_SOURCE_BYTES} source bytes.`,
        documentPath: document.path,
      });
    const parsed = parseStaticImports(
      document.content.source,
      document.content.language,
      canonicalPath
    );
    if (parsed.status === 'blocked')
      return Object.freeze({
        message: parsed.message,
        documentPath: document.path,
      });
    const imports: StaticImport[] = [];
    for (const entry of parsed.imports) {
      const target = resolveImportDocument(
        documentsByPath,
        canonicalPath,
        entry.specifier
      );
      if (target.status === 'blocked')
        return Object.freeze({
          message: target.message,
          documentPath: document.path,
        });
      imports.push(
        Object.freeze({ ...entry, targetDocumentId: target.document.id })
      );
    }
    modules.set(
      document.id,
      Object.freeze({
        document,
        language: document.content.language,
        source: document.content.source,
        imports: Object.freeze(imports),
      })
    );
    active.add(document.id);
    for (const entry of imports) {
      const target = workspace.docsById[entry.targetDocumentId];
      if (!target)
        throw new TypeError('Resolved Workspace import disappeared.');
      const failure = visit(target, depth + 1);
      if (failure) return failure;
    }
    active.delete(document.id);
    return undefined;
  };

  const root = workspace.docsById[rootDocumentId];
  if (!root)
    return Object.freeze({
      status: 'blocked',
      message: 'The isolated Server Function root document is missing.',
      documentPath: `/documents/${rootDocumentId}`,
    });
  const failure = visit(root, 0);
  if (failure) return Object.freeze({ status: 'blocked', ...failure });

  const ordered = [...modules.values()].sort((left, right) => {
    if (left.document.id === rootDocumentId) return -1;
    if (right.document.id === rootDocumentId) return 1;
    return (
      compareText(left.document.path, right.document.path) ||
      compareText(left.document.id, right.document.id)
    );
  });
  const generatedPathByDocumentId = new Map<string, string>();
  generatedPathByDocumentId.set(rootDocumentId, rootGeneratedPath);
  ordered
    .filter(({ document }) => document.id !== rootDocumentId)
    .forEach(({ document }, index) =>
      generatedPathByDocumentId.set(
        document.id,
        `src/.prodivix/server-runtime/modules/module-${String(index + 1).padStart(3, '0')}.mjs`
      )
    );

  const files: ExecutableProjectFile[] = [];
  for (const module of ordered) {
    const generatedPath = generatedPathByDocumentId.get(module.document.id)!;
    const rewritten = rewriteStaticImports(
      module.source,
      module.imports,
      generatedPathByDocumentId,
      generatedPath
    );
    const contents = transpileModule(module, rewritten);
    if (contents === undefined)
      return Object.freeze({
        status: 'blocked',
        message:
          'An isolated Server Function module could not be transpiled safely.',
        documentPath: module.document.path,
      });
    files.push(
      Object.freeze({
        path: generatedPath,
        contents,
        sourceTrace: moduleSourceTrace(module.document),
      })
    );
  }
  return Object.freeze({
    status: 'ready',
    files: Object.freeze(files),
    moduleDocumentIds: Object.freeze(
      ordered.map(({ document }) => document.id)
    ),
  });
};
