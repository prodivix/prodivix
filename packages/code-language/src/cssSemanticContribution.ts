import cssLanguageServicePackage from 'vscode-css-languageservice/package.json' with { type: 'json' };
import {
  DiagnosticSeverity,
  SymbolKind,
  type Diagnostic,
  type DocumentSymbol,
} from 'vscode-css-languageservice';
import {
  createCodeArtifactScopeId,
  createCodeSourceSpanFromOffsets,
  createSemanticId,
  isSameSemanticWorkspaceRevisions,
  type CodeArtifact,
  type SemanticContribution,
  type SemanticContributionProvider,
  type SemanticWorkspaceRevisions,
  type WorkspaceReferenceFact,
  type WorkspaceScopeContribution,
  type WorkspaceSymbolContribution,
} from '@prodivix/authoring';
import {
  createCodeModuleScopeId,
  createCodeModuleSymbolId,
} from './codeLanguageSemanticIds';
import {
  createCssLanguageProject,
  type CssLanguageDocument,
  type CssLanguageProject,
} from './cssLanguageProject';

export const CSS_SEMANTIC_PROVIDER_ID = 'core.code-language.css';
export const CSS_SEMANTIC_PROVIDER_VERSION = '1';
export const CSS_CONFIGURATION_DIGEST = `vscode-css-languageservice:${cssLanguageServicePackage.version}:default-data`;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

type CssSymbolCategory = 'keyframes' | 'mixin' | 'selector' | 'variable';
export type DurableCssSymbolCategory = 'keyframes' | 'selector';
type SemanticSourceSpan = NonNullable<
  WorkspaceSymbolContribution['sourceSpan']
>;

type CssSymbolDeclaration = Readonly<{
  id: string;
  name: string;
  category: CssSymbolCategory;
  stability: 'durable' | 'revision-scoped';
  document: CssLanguageDocument;
  sourceSpan: SemanticSourceSpan;
  selectionStart: DocumentSymbol['selectionRange']['start'];
}>;

export const createCssSymbolId = (
  workspaceId: string,
  artifactId: string,
  category: DurableCssSymbolCategory,
  name: string
): string =>
  createSemanticId('css-symbol', workspaceId, artifactId, category, name);

const flattenDocumentSymbols = (
  symbols: readonly DocumentSymbol[]
): readonly DocumentSymbol[] =>
  symbols.flatMap((symbol) => [
    symbol,
    ...flattenDocumentSymbols(symbol.children ?? []),
  ]);

const classifySymbol = (
  symbol: DocumentSymbol
): Readonly<{ category: CssSymbolCategory; name: string }> => {
  if (symbol.name.startsWith('@keyframes ')) {
    return Object.freeze({
      category: 'keyframes',
      name: symbol.name.slice('@keyframes '.length).trim(),
    });
  }
  if (symbol.kind === SymbolKind.Variable) {
    return Object.freeze({ category: 'variable', name: symbol.name });
  }
  if (
    symbol.kind === SymbolKind.Method ||
    symbol.kind === SymbolKind.Function
  ) {
    return Object.freeze({ category: 'mixin', name: symbol.name });
  }
  return Object.freeze({ category: 'selector', name: symbol.name });
};

const collectCssSymbolDeclarations = (input: {
  workspaceId: string;
  project: CssLanguageProject;
}): readonly CssSymbolDeclaration[] => {
  const declarations: CssSymbolDeclaration[] = [];
  const durableIds = new Set<string>();

  for (const document of input.project.documents) {
    const symbols = flattenDocumentSymbols(
      document.service.findDocumentSymbols2(
        document.document,
        document.stylesheet
      )
    );
    for (const symbol of symbols) {
      const classified = classifySymbol(symbol);
      if (!classified.name) continue;
      const sourceSpan = input.project.createSourceSpan(
        document.artifact.id,
        symbol.selectionRange
      );
      if (!sourceSpan) continue;
      const stability =
        classified.category === 'selector' ||
        classified.category === 'keyframes'
          ? 'durable'
          : 'revision-scoped';
      const id =
        stability === 'durable'
          ? createCssSymbolId(
              input.workspaceId,
              document.artifact.id,
              classified.category as DurableCssSymbolCategory,
              classified.name
            )
          : createSemanticId(
              'css-symbol',
              input.workspaceId,
              document.artifact.id,
              classified.category,
              classified.name,
              String(sourceSpan.startLine),
              String(sourceSpan.startColumn)
            );
      if (stability === 'durable') {
        if (durableIds.has(id)) continue;
        durableIds.add(id);
      }
      declarations.push(
        Object.freeze({
          ...classified,
          id,
          stability,
          document,
          sourceSpan,
          selectionStart: symbol.selectionRange.start,
        })
      );
    }
  }

  return Object.freeze(
    declarations.sort(
      (left, right) =>
        compareText(left.document.artifact.id, right.document.artifact.id) ||
        left.sourceSpan.startLine - right.sourceSpan.startLine ||
        left.sourceSpan.startColumn - right.sourceSpan.startColumn ||
        compareText(left.id, right.id)
    )
  );
};

const isSameSourceSpan = (
  left: SemanticSourceSpan,
  right: SemanticSourceSpan
): boolean =>
  left.artifactId === right.artifactId &&
  left.startLine === right.startLine &&
  left.startColumn === right.startColumn &&
  left.endLine === right.endLine &&
  left.endColumn === right.endColumn;

const diagnosticCode = (diagnostic: Diagnostic): 'COD-1001' | 'COD-5013' =>
  diagnostic.severity === DiagnosticSeverity.Error ||
  String(diagnostic.code ?? '').startsWith('css-')
    ? 'COD-1001'
    : 'COD-5013';

const diagnosticSeverity = (
  diagnostic: Diagnostic
): 'error' | 'warning' | 'info' => {
  if (diagnostic.severity === DiagnosticSeverity.Error) return 'error';
  if (diagnostic.severity === DiagnosticSeverity.Warning) return 'warning';
  return 'info';
};

export const collectCssProjectDiagnostics = (
  project: CssLanguageProject,
  artifactId?: string
): NonNullable<SemanticContribution['diagnostics']> => {
  const diagnostics: Array<
    NonNullable<SemanticContribution['diagnostics']>[number]
  > = [];

  for (const document of project.documents) {
    const artifact = document.artifact;
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
    for (const upstream of document.service.doValidation(
      document.document,
      document.stylesheet
    )) {
      const sourceSpan = project.createSourceSpan(artifact.id, upstream.range);
      if (!sourceSpan) continue;
      const code = diagnosticCode(upstream);
      diagnostics.push({
        code,
        severity: diagnosticSeverity(upstream),
        domain: 'code',
        message: upstream.message,
        hint:
          code === 'COD-1001'
            ? 'Correct the highlighted CSS syntax.'
            : 'Use a CSS or SCSS feature supported by the current authoring target.',
        docsUrl: `/reference/diagnostics/${code.toLowerCase()}`,
        targetRef: { kind: 'code-artifact', artifactId: artifact.id },
        sourceSpan,
        meta: {
          language: artifact.language,
          path: artifact.path,
          stage: code === 'COD-1001' ? 'parse' : 'compile',
          upstreamCode: upstream.code,
          source: upstream.source ?? artifact.language,
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

export const createCssSemanticContribution = (input: {
  workspaceId: string;
  artifacts: readonly CodeArtifact[];
}): SemanticContribution => {
  const project = createCssLanguageProject(input.artifacts);
  const declarations = collectCssSymbolDeclarations({
    workspaceId: input.workspaceId,
    project,
  });
  const scopes: WorkspaceScopeContribution[] = [];
  const symbols: WorkspaceSymbolContribution[] = [];
  const references: WorkspaceReferenceFact[] = [];

  for (const artifact of project.artifacts) {
    const moduleScopeId = createCodeModuleScopeId(
      input.workspaceId,
      artifact.id
    );
    scopes.push({
      id: moduleScopeId,
      kind: 'code-module',
      ownerRef: { kind: 'code-artifact', artifactId: artifact.id },
      parentId: createCodeArtifactScopeId(input.workspaceId, artifact.id),
    });
    symbols.push({
      id: createCodeModuleSymbolId(input.workspaceId, artifact.id),
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

  for (const declaration of declarations) {
    const artifact = declaration.document.artifact;
    symbols.push({
      id: declaration.id,
      stability: declaration.stability,
      kind: 'css-symbol',
      name: declaration.name,
      displayName: declaration.name,
      qualifiedName: `${artifact.path}#${declaration.name}`,
      scopeId: createCodeArtifactScopeId(input.workspaceId, artifact.id),
      ownerRef: { kind: 'code-artifact', artifactId: artifact.id },
      sourceSpan: declaration.sourceSpan,
      typeRef: `css-symbol:${declaration.category}`,
      capabilityIds: [`css.${declaration.category}`],
    });

    const nativeReferences = declaration.document.service.findReferences(
      declaration.document.document,
      declaration.selectionStart,
      declaration.document.stylesheet
    );
    for (const location of nativeReferences) {
      const sourceDocument = project.getDocumentByUri(location.uri);
      if (!sourceDocument) continue;
      const sourceSpan = project.createSourceSpan(
        sourceDocument.artifact.id,
        location.range
      );
      if (!sourceSpan || isSameSourceSpan(sourceSpan, declaration.sourceSpan)) {
        continue;
      }
      references.push({
        id: createSemanticId(
          'css-language-reference',
          input.workspaceId,
          declaration.id,
          sourceSpan.artifactId,
          String(sourceSpan.startLine),
          String(sourceSpan.startColumn),
          String(sourceSpan.endLine),
          String(sourceSpan.endColumn)
        ),
        kind: 'code-reference',
        sourceRef: {
          kind: 'code-artifact',
          artifactId: sourceDocument.artifact.id,
        },
        sourceSpan,
        scopeId: createCodeModuleScopeId(
          input.workspaceId,
          sourceDocument.artifact.id
        ),
        target: { kind: 'symbol-id', symbolId: declaration.id },
        resolutionMode: 'addressable',
        requiresDurableTarget: declaration.stability === 'durable',
      });
    }
  }

  const uniqueById = <Value extends { id: string }>(
    values: readonly Value[]
  ): readonly Value[] =>
    Object.freeze(
      [...new Map(values.map((value) => [value.id, value])).values()].sort(
        (left, right) => compareText(left.id, right.id)
      )
    );

  return Object.freeze({
    scopes: uniqueById(scopes),
    symbols: uniqueById(symbols),
    references: uniqueById(references),
    dependencies: Object.freeze([]),
    diagnostics: collectCssProjectDiagnostics(project),
  });
};

export type CreateCssSemanticContributionProviderInput = Readonly<{
  workspaceId: string;
  workspaceRevisions: SemanticWorkspaceRevisions;
  artifacts: readonly CodeArtifact[];
}>;

/** Publishes canonical CSS/SCSS modules, symbols, references and diagnostics. */
export const createCssSemanticContributionProvider = (
  input: CreateCssSemanticContributionProviderInput
): SemanticContributionProvider => {
  const artifacts = Object.freeze(
    input.artifacts
      .filter(
        (artifact) =>
          artifact.language === 'css' || artifact.language === 'scss'
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
  const contribution = createCssSemanticContribution({
    workspaceId: input.workspaceId,
    artifacts,
  });

  return Object.freeze({
    descriptor: Object.freeze({
      id: CSS_SEMANTIC_PROVIDER_ID,
      semanticVersion: CSS_SEMANTIC_PROVIDER_VERSION,
      configurationDigest: CSS_CONFIGURATION_DIGEST,
    }),
    contribute(identity) {
      if (
        !isSameSemanticWorkspaceRevisions(
          identity.workspaceRevisions,
          input.workspaceRevisions
        )
      ) {
        throw new Error(
          'CSS semantic provider revision does not match its captured snapshot.'
        );
      }
      return contribution;
    },
  });
};
