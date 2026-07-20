import * as ts from 'typescript';
import {
  createCodeArtifactScopeId,
  createCodeSourceSpanFromOffsets,
  createCodeSymbolId,
  createSemanticId,
  isSameSemanticWorkspaceRevisions,
  type CodeArtifact,
  type SemanticContribution,
  type SemanticContributionProvider,
  type SemanticWorkspaceRevisions,
  type WorkspaceDependencyContribution,
  type WorkspaceReferenceFact,
  type WorkspaceScopeContribution,
  type WorkspaceSymbolContribution,
  type WorkspaceSymbolKind,
} from '@prodivix/authoring';
import {
  createCodeModuleScopeId,
  createCodeModuleSymbolId,
} from './codeLanguageSemanticIds';
import {
  createTypeScriptCodeProject,
  getTypeScriptHostLibraryMode,
  type TypeScriptCodeProject,
} from './typescriptProject';
import {
  acquireTypeScriptCodeProject,
  defaultTypeScriptCodeProjectHost,
} from './typescriptProjectHost';

export const TYPESCRIPT_SEMANTIC_PROVIDER_ID = 'core.code-language.typescript';
export const TYPESCRIPT_SEMANTIC_PROVIDER_VERSION = '1';

export const TYPESCRIPT_CONFIGURATION_DIGEST = `typescript:${ts.version}:es2022:bundler:strict:${getTypeScriptHostLibraryMode()}`;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const createCodeExportLocalSymbolId = (exportName: string): string =>
  `export:${exportName}`;

type ExportDeclaration = Readonly<{
  artifact: CodeArtifact;
  fileName: string;
  exportName: string;
  localSymbolId: string;
  globalSymbolId: string;
  kind: WorkspaceSymbolKind;
  start: number;
  length: number;
}>;

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  Boolean(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((item) => item.kind === kind)
  );

const declarationKind = (node: ts.Node): WorkspaceSymbolKind => {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    return 'code-function';
  }
  if (
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return 'code-type';
  }
  return 'code-export';
};

const addExport = (
  output: ExportDeclaration[],
  input: {
    workspaceId: string;
    artifact: CodeArtifact;
    fileName: string;
    exportName: string;
    node: ts.Node;
    kind: WorkspaceSymbolKind;
    sourceFile: ts.SourceFile;
  }
): void => {
  const localSymbolId = createCodeExportLocalSymbolId(input.exportName);
  output.push(
    Object.freeze({
      artifact: input.artifact,
      fileName: input.fileName,
      exportName: input.exportName,
      localSymbolId,
      globalSymbolId: createCodeSymbolId(
        input.workspaceId,
        input.artifact.id,
        localSymbolId
      ),
      kind: input.kind,
      start: input.node.getStart(input.sourceFile),
      length: input.node.getWidth(input.sourceFile),
    })
  );
};

const collectExports = (input: {
  workspaceId: string;
  artifacts: readonly CodeArtifact[];
  project: ReturnType<typeof createTypeScriptCodeProject>;
}): readonly ExportDeclaration[] => {
  const output: ExportDeclaration[] = [];
  const program = input.project.service.getProgram();
  if (!program) return output;

  for (const artifact of input.artifacts) {
    const fileName = input.project.getFileName(artifact.id);
    const sourceFile = fileName ? program.getSourceFile(fileName) : undefined;
    if (!fileName || !sourceFile) continue;
    for (const statement of sourceFile.statements) {
      if (
        ts.isVariableStatement(statement) &&
        hasModifier(statement, ts.SyntaxKind.ExportKeyword)
      ) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          addExport(output, {
            ...input,
            artifact,
            fileName,
            sourceFile,
            exportName: declaration.name.text,
            node: declaration.name,
            kind: 'code-export',
          });
        }
        continue;
      }

      if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isInterfaceDeclaration(statement) ||
          ts.isTypeAliasDeclaration(statement) ||
          ts.isEnumDeclaration(statement)) &&
        hasModifier(statement, ts.SyntaxKind.ExportKeyword)
      ) {
        const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
        const nameNode = statement.name ?? statement;
        addExport(output, {
          ...input,
          artifact,
          fileName,
          sourceFile,
          exportName: isDefault
            ? 'default'
            : (statement.name?.text ?? 'default'),
          node: nameNode,
          kind: declarationKind(statement),
        });
        continue;
      }

      if (
        ts.isExportDeclaration(statement) &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause)
      ) {
        for (const specifier of statement.exportClause.elements) {
          addExport(output, {
            ...input,
            artifact,
            fileName,
            sourceFile,
            exportName: specifier.name.text,
            node: specifier.name,
            kind: 'code-export',
          });
        }
        continue;
      }

      if (ts.isExportAssignment(statement)) {
        addExport(output, {
          ...input,
          artifact,
          fileName,
          sourceFile,
          exportName: 'default',
          node: statement.expression,
          kind: 'code-export',
        });
      }
    }
  }

  return Object.freeze(
    output.sort(
      (left, right) =>
        compareText(left.artifact.id, right.artifact.id) ||
        compareText(left.exportName, right.exportName) ||
        left.start - right.start
    )
  );
};

const diagnosticCode = (diagnostic: ts.Diagnostic): string => {
  if (
    diagnostic.category === ts.DiagnosticCategory.Error &&
    diagnostic.code < 2000
  ) {
    return 'COD-1001';
  }
  if (diagnostic.code === 2307 || diagnostic.code === 2792) return 'COD-2002';
  if (diagnostic.code === 2304 || diagnostic.code === 2552) return 'COD-2001';
  return 'COD-2003';
};

const diagnosticSeverity = (
  code: string,
  category: ts.DiagnosticCategory
): 'error' | 'warning' | 'info' => {
  if (code === 'COD-1001' || code === 'COD-2002') return 'error';
  if (code === 'COD-2001' || code === 'COD-2003') return 'warning';
  if (category === ts.DiagnosticCategory.Error) return 'error';
  if (category === ts.DiagnosticCategory.Warning) return 'warning';
  return 'info';
};

export const collectTypeScriptProjectDiagnostics = (
  project: ReturnType<typeof createTypeScriptCodeProject>,
  artifactId?: string
): NonNullable<SemanticContribution['diagnostics']> => {
  const diagnostics: Array<
    NonNullable<SemanticContribution['diagnostics']>[number]
  > = [];
  for (const artifact of project.artifacts) {
    if (artifactId && artifact.id !== artifactId) continue;
    if (!artifact.source.trim()) {
      diagnostics.push({
        code: 'COD-1003',
        severity: 'warning',
        domain: 'code',
        message: 'The CodeArtifact is empty.',
        hint: 'Add source code or remove the unused artifact.',
        docsUrl: '/reference/diagnostics/cod-1003',
        targetRef: { kind: 'code-artifact', artifactId: artifact.id },
        sourceSpan: createCodeSourceSpanFromOffsets({
          artifactId: artifact.id,
          source: artifact.source,
          from: 0,
          to: 0,
        })!,
        meta: {
          language: artifact.language,
          path: artifact.path,
          stage: 'parse',
        },
      });
    }
    const fileName = project.getFileName(artifact.id);
    if (!fileName) continue;
    const languageDiagnostics = [
      ...project.service.getSyntacticDiagnostics(fileName),
      ...project.service.getSemanticDiagnostics(fileName),
    ];
    for (const diagnostic of languageDiagnostics) {
      const start = diagnostic.start ?? 0;
      const sourceSpan = project.createSourceSpan(artifact.id, {
        start,
        length: diagnostic.length ?? 0,
      });
      if (!sourceSpan) continue;
      const code = diagnosticCode(diagnostic);
      diagnostics.push({
        code,
        severity: diagnosticSeverity(code, diagnostic.category),
        domain: 'code',
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        hint: 'Open the source location and resolve the TypeScript language diagnostic.',
        docsUrl: `/reference/diagnostics/${code.toLowerCase()}`,
        targetRef: { kind: 'code-artifact', artifactId: artifact.id },
        sourceSpan,
        meta: {
          language: artifact.language,
          path: artifact.path,
          stage: code === 'COD-1001' ? 'parse' : 'symbol',
          upstreamCode: diagnostic.code,
          source: 'typescript',
        },
      });
    }
  }
  return Object.freeze(
    diagnostics.sort(
      (left, right) =>
        compareText(
          left.sourceSpan?.artifactId ?? '',
          right.sourceSpan?.artifactId ?? ''
        ) ||
        (left.sourceSpan?.startLine ?? 0) -
          (right.sourceSpan?.startLine ?? 0) ||
        (left.sourceSpan?.startColumn ?? 0) -
          (right.sourceSpan?.startColumn ?? 0) ||
        compareText(left.code, right.code) ||
        compareText(left.message, right.message)
    )
  );
};

export const createTypeScriptSemanticContributionFromProject = (input: {
  workspaceId: string;
  artifacts: readonly CodeArtifact[];
  project: TypeScriptCodeProject;
}): SemanticContribution => {
  const { project } = input;
  const buildContribution = (): SemanticContribution => {
    const exports = collectExports({ ...input, project });
    const scopes: WorkspaceScopeContribution[] = [];
    const symbols: WorkspaceSymbolContribution[] = [];
    const references: WorkspaceReferenceFact[] = [];
    const dependencies: WorkspaceDependencyContribution[] = [];
    const moduleSymbolByArtifactId = new Map<string, string>();

    for (const artifact of project.artifacts) {
      const moduleScopeId = createCodeModuleScopeId(
        input.workspaceId,
        artifact.id
      );
      const moduleSymbolId = createCodeModuleSymbolId(
        input.workspaceId,
        artifact.id
      );
      moduleSymbolByArtifactId.set(artifact.id, moduleSymbolId);
      scopes.push({
        id: moduleScopeId,
        kind: 'code-module',
        ownerRef: { kind: 'code-artifact', artifactId: artifact.id },
        parentId: createCodeArtifactScopeId(input.workspaceId, artifact.id),
      });
      symbols.push({
        id: moduleSymbolId,
        stability: 'durable',
        kind: 'code-module',
        name: artifact.path,
        displayName: artifact.path.split('/').at(-1) ?? artifact.path,
        qualifiedName: artifact.path,
        scopeId: createCodeArtifactScopeId(input.workspaceId, artifact.id),
        ownerRef: { kind: 'code-artifact', artifactId: artifact.id },
        typeRef: `code-module:${artifact.language}`,
      });
    }

    for (const declaration of exports) {
      const sourceSpan = createCodeSourceSpanFromOffsets({
        artifactId: declaration.artifact.id,
        source: declaration.artifact.source,
        from: declaration.start,
        to: declaration.start + declaration.length,
      });
      if (!sourceSpan) continue;
      symbols.push({
        id: declaration.globalSymbolId,
        stability: 'durable',
        kind: declaration.kind,
        name: declaration.exportName,
        displayName: declaration.exportName,
        qualifiedName: `${declaration.artifact.path}#${declaration.exportName}`,
        scopeId: createCodeArtifactScopeId(
          input.workspaceId,
          declaration.artifact.id
        ),
        ownerRef: {
          kind: 'code-artifact',
          artifactId: declaration.artifact.id,
        },
        sourceSpan,
        typeRef: `code-export:${declaration.kind}`,
        capabilityIds: ['code.export'],
      });

      const entries =
        project.service.getReferencesAtPosition(
          declaration.fileName,
          declaration.start
        ) ?? [];
      for (const entry of entries) {
        if (
          entry.fileName === declaration.fileName &&
          entry.textSpan.start === declaration.start
        ) {
          continue;
        }
        const sourceArtifact = project.getArtifactByFileName(entry.fileName);
        if (!sourceArtifact) continue;
        const referenceSpan = project.createSourceSpan(
          sourceArtifact.id,
          entry.textSpan
        );
        if (!referenceSpan) continue;
        const referenceId = createSemanticId(
          'code-language-reference',
          input.workspaceId,
          declaration.globalSymbolId,
          sourceArtifact.id,
          String(referenceSpan.startLine),
          String(referenceSpan.startColumn),
          String(referenceSpan.endLine),
          String(referenceSpan.endColumn)
        );
        references.push({
          id: referenceId,
          kind:
            sourceArtifact.id === declaration.artifact.id
              ? 'code-reference'
              : 'import',
          sourceRef: { kind: 'code-artifact', artifactId: sourceArtifact.id },
          sourceSpan: referenceSpan,
          scopeId: createCodeModuleScopeId(
            input.workspaceId,
            sourceArtifact.id
          ),
          target: { kind: 'symbol-id', symbolId: declaration.globalSymbolId },
          resolutionMode: 'addressable',
          requiresDurableTarget: true,
        });

        if (sourceArtifact.id !== declaration.artifact.id) {
          const sourceModuleSymbolId = moduleSymbolByArtifactId.get(
            sourceArtifact.id
          );
          const targetModuleSymbolId = moduleSymbolByArtifactId.get(
            declaration.artifact.id
          );
          if (sourceModuleSymbolId && targetModuleSymbolId) {
            dependencies.push({
              id: createSemanticId(
                'code-language-import-dependency',
                input.workspaceId,
                sourceArtifact.id,
                declaration.artifact.id
              ),
              kind: 'import',
              sourceSymbolId: sourceModuleSymbolId,
              targetSymbolId: targetModuleSymbolId,
            });
          }
        }
      }
    }

    const uniqueById = <Value extends { id: string }>(
      values: readonly Value[]
    ) =>
      Object.freeze(
        [...new Map(values.map((value) => [value.id, value])).values()].sort(
          (left, right) => compareText(left.id, right.id)
        )
      );

    return Object.freeze({
      scopes: uniqueById(scopes),
      symbols: uniqueById(symbols),
      references: uniqueById(references),
      dependencies: uniqueById(dependencies),
      diagnostics: collectTypeScriptProjectDiagnostics(project),
    });
  };
  return buildContribution();
};

export const createTypeScriptSemanticContribution = (input: {
  workspaceId: string;
  artifacts: readonly CodeArtifact[];
}): SemanticContribution => {
  const project = createTypeScriptCodeProject(input.artifacts);
  try {
    return createTypeScriptSemanticContributionFromProject({
      ...input,
      project,
    });
  } finally {
    project.dispose();
  }
};

export type CreateTypeScriptSemanticContributionProviderInput = Readonly<{
  workspaceId: string;
  workspaceRevisions: SemanticWorkspaceRevisions;
  artifacts: readonly CodeArtifact[];
}>;

/** Publishes canonical TS/JS modules, exports, references and diagnostics. */
export const createTypeScriptSemanticContributionProvider = (
  input: CreateTypeScriptSemanticContributionProviderInput
): SemanticContributionProvider => {
  const artifacts = Object.freeze(
    input.artifacts
      .filter(
        (artifact) => artifact.language === 'ts' || artifact.language === 'js'
      )
      .sort((left, right) => compareText(left.id, right.id))
  );
  for (const artifact of artifacts) {
    const revision = input.workspaceRevisions.documentRevs[artifact.id];
    if (!revision || String(revision.contentRev) !== artifact.revision) {
      throw new Error(
        `CodeArtifact "${artifact.id}" revision does not match the Workspace snapshot.`
      );
    }
  }
  const contribution = (() => {
    const lease = acquireTypeScriptCodeProject(
      defaultTypeScriptCodeProjectHost,
      input.workspaceId,
      artifacts
    );
    try {
      return createTypeScriptSemanticContributionFromProject({
        workspaceId: input.workspaceId,
        artifacts,
        project: lease.project,
      });
    } finally {
      lease.release();
    }
  })();

  return Object.freeze({
    descriptor: Object.freeze({
      id: TYPESCRIPT_SEMANTIC_PROVIDER_ID,
      semanticVersion: TYPESCRIPT_SEMANTIC_PROVIDER_VERSION,
      configurationDigest: TYPESCRIPT_CONFIGURATION_DIGEST,
    }),
    contribute(identity) {
      if (
        !isSameSemanticWorkspaceRevisions(
          identity.workspaceRevisions,
          input.workspaceRevisions
        )
      ) {
        throw new Error(
          'TypeScript semantic provider revision does not match its captured snapshot.'
        );
      }
      return contribution;
    },
  });
};
