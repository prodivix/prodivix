import glslParserPackage from '@shaderfrog/glsl-parser/package.json' with { type: 'json' };
import wgslReflectPackage from 'wgsl_reflect/package.json' with { type: 'json' };
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
  type WorkspaceSymbolKind,
} from '@prodivix/authoring';
import {
  createCodeModuleScopeId,
  createCodeModuleSymbolId,
} from '../codeLanguageSemanticIds';
import { compareShaderText, type ShaderSymbol } from './shaderLanguage.types';
import {
  createShaderLanguageProject,
  type ShaderLanguageProject,
} from './shaderLanguageProject';

export const SHADER_SEMANTIC_PROVIDER_ID = 'core.code-language.shader';
export const SHADER_SEMANTIC_PROVIDER_VERSION = '1';
export const SHADER_CONFIGURATION_DIGEST = `shaderfrog-glsl-parser:${glslParserPackage.version}:wgsl-reflect:${wgslReflectPackage.version}:prodivix-shader-symbols-v1`;

const symbolKind = (symbol: ShaderSymbol): WorkspaceSymbolKind => {
  if (symbol.category === 'entry') return 'shader-entry';
  if (symbol.category === 'function') return 'code-function';
  if (symbol.category === 'type') return 'code-type';
  return 'code-export';
};

const symbolCapabilities = (symbol: ShaderSymbol): readonly string[] => {
  if (symbol.category === 'entry') {
    return Object.freeze([
      'shader.entry',
      ...(symbol.stage && symbol.stage !== 'unknown'
        ? [`shader.${symbol.stage}`]
        : []),
    ]);
  }
  return Object.freeze([`shader.${symbol.category}`]);
};

export const collectShaderProjectDiagnostics = (
  project: ShaderLanguageProject,
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
        message: 'The shader CodeArtifact is empty.',
        hint: 'Add shader source code or remove the unused artifact.',
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
    for (const upstream of document.parseDiagnostics) {
      const sourceSpan = project.createSourceSpan(artifact.id, upstream);
      if (!sourceSpan) continue;
      diagnostics.push({
        code: 'COD-1001',
        severity: 'error',
        domain: 'code',
        message: upstream.message,
        hint: `Correct the highlighted ${artifact.language.toUpperCase()} syntax.`,
        docsUrl: '/reference/diagnostics/cod-1001',
        targetRef: { kind: 'code-artifact', artifactId: artifact.id },
        sourceSpan,
        meta: {
          language: artifact.language,
          path: artifact.path,
          stage: 'parse',
          source: upstream.upstreamCode ?? artifact.language,
        },
      });
    }
  }
  return Object.freeze(
    diagnostics.sort(
      (left, right) =>
        compareShaderText(
          left.sourceSpan?.artifactId ?? '',
          right.sourceSpan?.artifactId ?? ''
        ) ||
        (left.sourceSpan?.startLine ?? 0) -
          (right.sourceSpan?.startLine ?? 0) ||
        (left.sourceSpan?.startColumn ?? 0) -
          (right.sourceSpan?.startColumn ?? 0) ||
        compareShaderText(left.code, right.code) ||
        compareShaderText(left.message, right.message)
    )
  );
};

export const createShaderSemanticContribution = (input: {
  workspaceId: string;
  artifacts: readonly CodeArtifact[];
}): SemanticContribution => {
  const project = createShaderLanguageProject(input);
  const scopes: WorkspaceScopeContribution[] = [];
  const symbols: WorkspaceSymbolContribution[] = [];
  const references: WorkspaceReferenceFact[] = [];

  for (const document of project.documents) {
    const artifact = document.artifact;
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

    for (const declaration of document.symbols.filter(
      (symbol) => symbol.moduleLevel
    )) {
      const sourceSpan = project.createSourceSpan(
        artifact.id,
        declaration.declaration
      );
      if (!sourceSpan) continue;
      symbols.push({
        id: declaration.id,
        stability:
          declaration.category === 'entry' ? 'durable' : 'revision-scoped',
        kind: symbolKind(declaration),
        name: declaration.name,
        displayName: declaration.name,
        qualifiedName: `${artifact.path}#${declaration.name}`,
        scopeId: createCodeArtifactScopeId(input.workspaceId, artifact.id),
        ownerRef: { kind: 'code-artifact', artifactId: artifact.id },
        sourceSpan,
        typeRef:
          declaration.category === 'entry'
            ? `shader-entry:${artifact.language}:${declaration.stage ?? 'unknown'}`
            : `shader-symbol:${artifact.language}:${declaration.category}`,
        capabilityIds: symbolCapabilities(declaration),
      });

      for (const occurrence of declaration.occurrences) {
        if (occurrence.declaration) continue;
        const referenceSpan = project.createSourceSpan(artifact.id, occurrence);
        if (!referenceSpan) continue;
        references.push({
          id: createSemanticId(
            'shader-language-reference',
            input.workspaceId,
            declaration.id,
            artifact.id,
            String(referenceSpan.startLine),
            String(referenceSpan.startColumn),
            String(referenceSpan.endLine),
            String(referenceSpan.endColumn)
          ),
          kind: 'code-reference',
          sourceRef: { kind: 'code-artifact', artifactId: artifact.id },
          sourceSpan: referenceSpan,
          scopeId: moduleScopeId,
          target: { kind: 'symbol-id', symbolId: declaration.id },
          resolutionMode: 'addressable',
          requiresDurableTarget: declaration.category === 'entry',
        });
      }
    }
  }

  const uniqueById = <Value extends { id: string }>(
    values: readonly Value[]
  ): readonly Value[] =>
    Object.freeze(
      [...new Map(values.map((value) => [value.id, value])).values()].sort(
        (left, right) => compareShaderText(left.id, right.id)
      )
    );

  return Object.freeze({
    scopes: uniqueById(scopes),
    symbols: uniqueById(symbols),
    references: uniqueById(references),
    dependencies: Object.freeze([]),
    diagnostics: collectShaderProjectDiagnostics(project),
  });
};

export type CreateShaderSemanticContributionProviderInput = Readonly<{
  workspaceId: string;
  workspaceRevisions: SemanticWorkspaceRevisions;
  artifacts: readonly CodeArtifact[];
}>;

/** Publishes canonical GLSL/WGSL modules, entries, symbols and references. */
export const createShaderSemanticContributionProvider = (
  input: CreateShaderSemanticContributionProviderInput
): SemanticContributionProvider => {
  const artifacts = Object.freeze(
    input.artifacts
      .filter(
        (artifact) =>
          artifact.language === 'glsl' || artifact.language === 'wgsl'
      )
      .sort((left, right) => compareShaderText(left.id, right.id))
  );
  for (const artifact of artifacts) {
    const revision = input.workspaceRevisions.documentRevs[artifact.id];
    if (!revision || String(revision.contentRev) !== artifact.revision) {
      throw new Error(
        `CodeArtifact "${artifact.id}" revision does not match the Workspace snapshot.`
      );
    }
  }
  const contribution = createShaderSemanticContribution({
    workspaceId: input.workspaceId,
    artifacts,
  });

  return Object.freeze({
    descriptor: Object.freeze({
      id: SHADER_SEMANTIC_PROVIDER_ID,
      semanticVersion: SHADER_SEMANTIC_PROVIDER_VERSION,
      configurationDigest: SHADER_CONFIGURATION_DIGEST,
    }),
    contribute(identity) {
      if (
        !isSameSemanticWorkspaceRevisions(
          identity.workspaceRevisions,
          input.workspaceRevisions
        )
      ) {
        throw new Error(
          'Shader semantic provider revision does not match its captured snapshot.'
        );
      }
      return contribution;
    },
  });
};
